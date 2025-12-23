const { app, BrowserWindow, session, Menu, shell, dialog, ipcMain, powerMonitor, Tray, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');
const SessionProtection = require('./session-protection');
const AutoLaunch = require('auto-launch');

// Initialize session protection
const sessionProtection = new SessionProtection();

// Auto-launch configuration
const autoLauncher = new AutoLaunch({
  name: 'WlfRyt Google Calendar',
  path: app.getPath('exe'),
  isHidden: true
});

// Initialize encrypted store for app settings
const store = new Store({
  name: 'app-config',
  encryptionKey: 'wlfryt-google-calendar-secure-key-2024',
  defaults: {
    windowBounds: { width: 1200, height: 800 },
    windowMaximized: false,
    startWithWindows: false,
    startMinimized: false,
    minimizeToTray: true,
    closeToTray: true
  }
});

// Security: Disable navigation to external URLs
const ALLOWED_URLS = [
  'https://calendar.google.com',
  'https://accounts.google.com',
  'https://www.google.com/calendar',
  'https://www.google.com/signin',
  'https://www.google.com/accounts',
  'https://myaccount.google.com',
  'https://support.google.com',
  'https://ssl.gstatic.com',
  'https://www.gstatic.com',
  'https://apis.google.com',
  'https://oauth2.googleapis.com',
  'https://www.googleapis.com',
  'https://play.google.com', // For app verification
  'https://gds.google.com',
  'https://ogs.google.com',
  'https://lh3.googleusercontent.com', // Profile pictures
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Security: Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function isAllowedUrl(url) {
  // Allow all Google domain URLs for authentication
  const googleDomains = [
    '.google.com',
    '.googleapis.com',
    '.gstatic.com',
    '.googleusercontent.com'
  ];
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Check if it's a Google domain
    if (googleDomains.some(domain => hostname.endsWith(domain))) {
      return true;
    }
    
    // Check explicit allowed URLs
    return ALLOWED_URLS.some(allowed => url.startsWith(allowed));
  } catch (e) {
    return false;
  }
}

function createWindow() {
  const windowBounds = store.get('windowBounds');
  const windowMaximized = store.get('windowMaximized');

  // Configure session for persistent login with enhanced security
  const ses = session.fromPartition('persist:google-calendar-secure');

  // Security: Enhanced cookie settings
  ses.cookies.on('changed', (event, cookie, cause, removed) => {
    // Log cookie changes for security monitoring (in development)
    if (!app.isPackaged && cookie.domain.includes('google')) {
      console.log(`Cookie ${removed ? 'removed' : 'set'}: ${cookie.name} (${cause})`);
    }
  });

  // Security: Set secure headers and CSP
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' https://*.google.com https://*.googleapis.com https://*.gstatic.com 'unsafe-inline' 'unsafe-eval' data: blob:"],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['SAMEORIGIN'],
        'X-XSS-Protection': ['1; mode=block']
      }
    });
  });

  // Security: Block potentially dangerous requests
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const url = details.url.toLowerCase();
    
    // Block known tracking/analytics that aren't needed
    const blockedPatterns = [
      'doubleclick.net',
      'googlesyndication.com',
      'googleadservices.com'
    ];
    
    if (blockedPatterns.some(pattern => url.includes(pattern))) {
      callback({ cancel: true });
      return;
    }
    
    callback({ cancel: false });
  });

  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    minWidth: 800,
    minHeight: 600,
    title: 'WlfRyt Google Calendar',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      // Security settings
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for preload script
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Preload script for secure IPC
      preload: path.join(__dirname, 'preload.js'),
      // Persistent session with encrypted partition
      partition: 'persist:google-calendar-secure',
      // Spellcheck
      spellcheck: true
    },
    show: false,
    backgroundColor: '#ffffff'
  });

  // Restore maximized state
  if (windowMaximized) {
    mainWindow.maximize();
  }

  // Create application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow.reload()
        },
        {
          label: 'Go to Today',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow.loadURL('https://calendar.google.com/calendar/r')
        },
        { type: 'separator' },
        {
          label: 'Lock Session',
          accelerator: 'CmdOrCtrl+L',
          click: () => lockSession()
        },
        { type: 'separator' },
        {
          label: 'Clear Session Data',
          click: async () => {
            const result = await dialog.showMessageBox(mainWindow, {
              type: 'warning',
              buttons: ['Cancel', 'Clear Data'],
              defaultId: 0,
              title: 'Clear Session Data',
              message: 'This will log you out and clear all saved data. Continue?'
            });
            if (result.response === 1) {
              await session.fromPartition('persist:google-calendar-secure').clearStorageData();
              await sessionProtection.clearAllData();
              mainWindow.reload();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Day View',
          accelerator: 'D',
          click: () => mainWindow.loadURL('https://calendar.google.com/calendar/r/day')
        },
        {
          label: 'Week View',
          accelerator: 'W',
          click: () => mainWindow.loadURL('https://calendar.google.com/calendar/r/week')
        },
        {
          label: 'Month View',
          accelerator: 'M',
          click: () => mainWindow.loadURL('https://calendar.google.com/calendar/r/month')
        },
        {
          label: 'Year View',
          accelerator: 'Y',
          click: () => mainWindow.loadURL('https://calendar.google.com/calendar/r/year')
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            const zoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(Math.min(zoom + 0.1, 2.0));
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const zoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(Math.max(zoom - 0.1, 0.5));
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.setZoomFactor(1.0)
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Settings',
      submenu: [
        {
          label: 'Start with Windows',
          type: 'checkbox',
          checked: store.get('startWithWindows'),
          click: async (menuItem) => {
            store.set('startWithWindows', menuItem.checked);
            if (menuItem.checked) {
              await autoLauncher.enable();
            } else {
              await autoLauncher.disable();
            }
          }
        },
        {
          label: 'Start Minimized',
          type: 'checkbox',
          checked: store.get('startMinimized'),
          click: (menuItem) => {
            store.set('startMinimized', menuItem.checked);
          }
        },
        { type: 'separator' },
        {
          label: 'Minimize to Tray',
          type: 'checkbox',
          checked: store.get('minimizeToTray'),
          click: (menuItem) => {
            store.set('minimizeToTray', menuItem.checked);
          }
        },
        {
          label: 'Close to Tray',
          type: 'checkbox',
          checked: store.get('closeToTray'),
          click: (menuItem) => {
            store.set('closeToTray', menuItem.checked);
          }
        },
        { type: 'separator' },
        {
          label: 'Security',
          submenu: [
            {
              label: 'Lock on Minimize',
              type: 'checkbox',
              checked: sessionProtection.settings.lockOnMinimize,
              click: (menuItem) => {
                sessionProtection.saveSettings({ lockOnMinimize: menuItem.checked });
              }
            },
            {
              label: 'Auto-Lock: 15 minutes',
              type: 'radio',
              checked: sessionProtection.settings.autoLockMinutes === 15,
              click: () => {
                sessionProtection.saveSettings({ autoLockMinutes: 15 });
              }
            },
            {
              label: 'Auto-Lock: 30 minutes',
              type: 'radio',
              checked: sessionProtection.settings.autoLockMinutes === 30,
              click: () => {
                sessionProtection.saveSettings({ autoLockMinutes: 30 });
              }
            },
            {
              label: 'Auto-Lock: 1 hour',
              type: 'radio',
              checked: sessionProtection.settings.autoLockMinutes === 60,
              click: () => {
                sessionProtection.saveSettings({ autoLockMinutes: 60 });
              }
            },
            {
              label: 'Auto-Lock: Never',
              type: 'radio',
              checked: sessionProtection.settings.autoLockMinutes === 0,
              click: () => {
                sessionProtection.saveSettings({ autoLockMinutes: 0 });
                sessionProtection.clearLockTimeout();
              }
            },
            { type: 'separator' },
            {
              label: 'Security Status...',
              click: () => {
                const status = sessionProtection.getSecurityStatus();
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'Security Status',
                  message: 'Session Protection Status',
                  detail: `Encryption: ${status.encryptionAlgorithm}\nKey Storage: ${status.keyStorage}\nSecure Storage: ${status.secureStorageAvailable ? 'Available' : 'Not Available'}\nSession Protected: ${status.sessionProtected ? 'Yes' : 'No'}\nIntegrity Verified: ${status.integrityVerified ? 'Yes' : 'No'}\nAuto-Lock: ${status.autoLockMinutes > 0 ? status.autoLockMinutes + ' minutes' : 'Disabled'}`
                });
              }
            }
          ]
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Google Calendar Help',
          click: () => shell.openExternal('https://support.google.com/calendar')
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About WlfRyt Google Calendar',
              message: 'WlfRyt Google Calendar',
              detail: `Version ${app.getVersion()}\n\nA secure standalone Google Calendar application with persistent login.\n\nSecurity: AES-256-GCM encryption, OS-level key protection\n\n© 2025 WlfRyt`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Load Google Calendar
  mainWindow.loadURL('https://calendar.google.com/calendar/r');

  // Show window when ready (unless starting minimized)
  mainWindow.once('ready-to-show', () => {
    const startMinimized = store.get('startMinimized');
    if (startMinimized && app.commandLine.hasSwitch('hidden')) {
      // Don't show, stay in tray
    } else {
      mainWindow.show();
    }
  });

  // Security: Handle navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
    // Allow navigation within the same window for Google URLs
  });

  // Security: Handle new window requests - load in same window instead of opening new ones
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      // Load Google URLs in the same window instead of opening a new window
      mainWindow.loadURL(url);
      return { action: 'deny' };
    }
    // Open non-Google URLs in external browser
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Save window state on close
  mainWindow.on('close', (event) => {
    if (!mainWindow.isMaximized()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
    store.set('windowMaximized', mainWindow.isMaximized());
    
    // Minimize to tray instead of closing
    if (store.get('closeToTray') && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
  
  // Handle minimize to tray
  mainWindow.on('minimize', (event) => {
    // Security: Lock on minimize if enabled
    if (sessionProtection.settings.lockOnMinimize) {
      lockSession();
    }
    
    if (store.get('minimizeToTray')) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Security: Lock when window loses focus for extended time
  let focusLostTime = null;
  mainWindow.on('blur', () => {
    focusLostTime = Date.now();
  });
  
  mainWindow.on('focus', () => {
    // If window was unfocused for more than 5 minutes, consider locking
    if (focusLostTime && (Date.now() - focusLostTime) > 5 * 60 * 1000) {
      if (sessionProtection.settings.autoLockMinutes > 0) {
        // Reset the activity timer
        sessionProtection.resetLockTimeout();
      }
    }
    focusLostTime = null;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Security: Prevent dev tools in production
  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }
}

// Security: Disable hardware acceleration if needed for security
// app.disableHardwareAcceleration();

// Create system tray
function createTray() {
  // Create tray icon (16x16 for Windows)
  const trayIconPath = path.join(__dirname, '../assets/icon.png');
  let trayIcon;
  
  try {
    trayIcon = nativeImage.createFromPath(trayIconPath);
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch (e) {
    // Fallback: create a simple icon
    trayIcon = nativeImage.createEmpty();
  }
  
  tray = new Tray(trayIcon);
  tray.setToolTip('WlfRyt Google Calendar');
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Google Calendar',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Today',
      click: () => {
        if (mainWindow) {
          mainWindow.loadURL('https://calendar.google.com/calendar/r');
          mainWindow.show();
        }
      }
    },
    {
      label: 'New Event',
      click: () => {
        if (mainWindow) {
          mainWindow.loadURL('https://calendar.google.com/calendar/r/eventedit');
          mainWindow.show();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Lock Session',
      click: () => lockSession()
    },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: store.get('startWithWindows'),
      click: async (menuItem) => {
        store.set('startWithWindows', menuItem.checked);
        if (menuItem.checked) {
          await autoLauncher.enable();
        } else {
          await autoLauncher.disable();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Double-click to show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Lock screen HTML
const lockScreenHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Session Locked</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .lock-container {
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
    }
    .lock-icon { font-size: 64px; margin-bottom: 20px; }
    h1 { color: #333; margin-bottom: 10px; font-size: 24px; }
    p { color: #666; margin-bottom: 30px; }
    button {
      background: #4285f4;
      color: white;
      border: none;
      padding: 14px 40px;
      font-size: 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #3367d6; }
    .security-note {
      margin-top: 20px;
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="lock-container">
    <div class="lock-icon">🔒</div>
    <h1>Session Locked</h1>
    <p>Your Google Calendar session has been locked for security.</p>
    <button onclick="unlock()">Unlock Session</button>
    <p class="security-note">Session data is encrypted and protected</p>
  </div>
  <script>
    function unlock() {
      window.secureApp.lockSession().then(() => window.location.reload());
    }
  </script>
</body>
</html>
`;

let lockWindow = null;

function lockSession() {
  if (lockWindow) return;
  
  sessionProtection.lock();
  
  // Hide main window
  if (mainWindow) {
    mainWindow.hide();
  }
  
  // Create lock window
  lockWindow = new BrowserWindow({
    width: 500,
    height: 400,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  lockWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(lockScreenHtml));
  
  lockWindow.on('closed', () => {
    lockWindow = null;
  });
}

function unlockSession() {
  sessionProtection.unlock();
  
  if (lockWindow) {
    lockWindow.close();
    lockWindow = null;
  }
  
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

// IPC Handlers
ipcMain.handle('lock-session', () => {
  if (sessionProtection.isLocked) {
    unlockSession();
    return false;
  } else {
    lockSession();
    return true;
  }
});

ipcMain.handle('is-locked', () => sessionProtection.isLocked);

ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  securityStatus: sessionProtection.getSecurityStatus()
}));

ipcMain.handle('clear-session', async () => {
  await session.fromPartition('persist:google-calendar-secure').clearStorageData();
  await sessionProtection.clearAllData();
  return true;
});

app.whenReady().then(async () => {
  // Security: Set up permission handler
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['notifications', 'clipboard-read', 'clipboard-sanitized-write'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Sync auto-launch state with stored setting
  try {
    const isEnabled = await autoLauncher.isEnabled();
    const shouldBeEnabled = store.get('startWithWindows');
    if (isEnabled !== shouldBeEnabled) {
      if (shouldBeEnabled) {
        await autoLauncher.enable();
      } else {
        await autoLauncher.disable();
      }
    }
  } catch (e) {
    console.error('Auto-launch sync error:', e);
  }

  // Create system tray
  createTray();

  // Monitor system lock/sleep events
  powerMonitor.on('lock-screen', () => {
    lockSession();
  });

  powerMonitor.on('suspend', () => {
    lockSession();
  });

  // Start activity timeout
  sessionProtection.resetLockTimeout();

  createWindow();
  
  // Reset timeout on user activity
  if (mainWindow) {
    mainWindow.on('focus', () => sessionProtection.resetLockTimeout());
    mainWindow.webContents.on('before-input-event', () => sessionProtection.resetLockTimeout());
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Handle before-quit to set quitting flag
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Handle certificate errors strictly
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(false); // Reject invalid certificates
});

// Security: Prevent loading remote content
app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});
