const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('secureApp', {
  // Lock the session
  lockSession: () => ipcRenderer.invoke('lock-session'),
  
  // Check if session is locked
  isLocked: () => ipcRenderer.invoke('is-locked'),
  
  // Get app info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  
  // Request session clear
  clearSession: () => ipcRenderer.invoke('clear-session'),
  
  // Listen for lock state changes
  onLockStateChanged: (callback) => {
    ipcRenderer.on('lock-state-changed', (event, isLocked) => callback(isLocked));
  }
});
