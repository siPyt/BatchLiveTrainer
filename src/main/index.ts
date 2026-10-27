import { app, shell, BrowserWindow, Menu, powerSaveBlocker, powerMonitor } from 'electron'
import { join } from 'path'

const isDev = !app.isPackaged

// Chromium's window-occlusion tracking decides an idle or locked-screen window is hidden and stops painting it; the
// window then stays a blank grey rectangle until something forces a repaint (a click). Turn the tracking off.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

// Windows taskbar needs an .ico; other platforms use the PNG.
const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#c8ccd2',
    title: 'BatchLiveTrainer',
    autoHideMenuBar: true,
    icon: join(__dirname, `../../build/${iconFile}`),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Belt and braces for the grey-window problem: force a repaint whenever the window could have been hidden or the
  // machine could have slept, and reload if the renderer process itself dies.
  const repaint = (): void => { if (!mainWindow.isDestroyed()) mainWindow.webContents.invalidate() }
  mainWindow.on('show', repaint)
  mainWindow.on('restore', repaint)
  mainWindow.on('focus', repaint)
  const afterWake = (): void => { repaint(); setTimeout(repaint, 500) }
  powerMonitor.on('resume', afterWake)
  powerMonitor.on('unlock-screen', afterWake)
  mainWindow.webContents.on('render-process-gone', () => { if (!mainWindow.isDestroyed()) mainWindow.webContents.reload() })
  mainWindow.webContents.on('unresponsive', () => repaint())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer: dev server in development, built file in production.
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Minimal operator-style application menu.
function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [{ role: 'quit', label: 'Exit' }]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.batchlivetrainer.app')
  }
  buildMenu()
  // The simulator must never go to sleep: no display sleep, no system sleep while the app is open.
  powerSaveBlocker.start('prevent-display-sleep')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
