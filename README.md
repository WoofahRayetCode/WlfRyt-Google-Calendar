# WlfRyt Google Calendar

A secure standalone desktop application for Google Calendar with persistent login and security protection.

## Features

- **Persistent Login**: Stay logged in between sessions - no need to re-authenticate every time
- **Start with Windows**: Optionally launch automatically when Windows starts
- **System Tray**: Minimize to system tray, stays running in background
- **Security Protection**:
  - Sandboxed browser environment
  - Context isolation enabled
  - Node integration disabled
  - Strict CSP (Content Security Policy)
  - Certificate validation
  - Single instance lock
  - Encrypted local storage
  - URL whitelist protection
  - Auto-lock on inactivity/sleep/screen lock
- **Native Desktop Experience**:
  - System tray integration with quick actions
  - Keyboard shortcuts
  - Zoom controls
  - Calendar view shortcuts (Day/Week/Month/Year)

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/WlfRyt-Google-Calendar.git
cd WlfRyt-Google-Calendar
```

2. Install dependencies:
```bash
npm install
```

3. Run the application:
```bash
npm start
```

## Building for Distribution

### Windows
```bash
npm run build:win
```

### macOS
```bash
npm run build:mac
```

### Linux
```bash
npm run build:linux
```

Built applications will be in the `dist` folder.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+R` | Reload |
| `Ctrl+T` | Go to Today |
| `Ctrl+L` | Lock Session |
| `D` | Day View |
| `W` | Week View |
| `M` | Month View |
| `Y` | Year View |
| `Ctrl++` | Zoom In |
| `Ctrl+-` | Zoom Out |
| `Ctrl+0` | Reset Zoom |
| `F11` | Toggle Fullscreen |
| `Alt+F4` | Exit |

## Settings Menu

| Setting | Description |
|---------|-------------|
| Start with Windows | Launch app automatically when Windows starts |
| Start Minimized | Start hidden in system tray |
| Minimize to Tray | Minimize button hides to tray instead of taskbar |
| Close to Tray | Close button hides to tray instead of quitting |

## System Tray

The app runs in the system tray with quick access to:
- Open Google Calendar
- Go to Today
- Create New Event
- Lock Session
- Toggle Start with Windows
- Quit (completely exit the app)

**Double-click** the tray icon to show the window.

## Security Features

1. **Sandboxed Renderer**: The web content runs in a sandboxed environment
2. **Context Isolation**: Prevents preload scripts from leaking privileged APIs
3. **No Node Integration**: Node.js APIs are not available in the renderer
4. **URL Whitelist**: Only Google domains are allowed
5. **Certificate Validation**: Invalid SSL certificates are rejected
6. **Single Instance**: Prevents multiple copies from running
7. **Encrypted Storage**: App settings are encrypted locally
8. **Permission Control**: Only necessary permissions are granted

## Data Storage

Session data and cookies are stored securely in:
- **Windows**: `%APPDATA%/wlfryt-google-calendar/`
- **macOS**: `~/Library/Application Support/wlfryt-google-calendar/`
- **Linux**: `~/.config/wlfryt-google-calendar/`

To clear all data and log out, use **File > Clear Session Data**.

## License

MIT License - See LICENSE file for details.
