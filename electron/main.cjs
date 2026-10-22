'use strict'

const { app, BrowserWindow, shell, ipcMain, screen, nativeImage, dialog } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const path = require('path')

const appIconPath = path.join(__dirname, '..', 'images', 'macrotouch-logo.png')
const appIcon = nativeImage.createFromPath(appIconPath)

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
      return
    }

    if (app.isReady()) {
      createWindow()
    }
  })
}

// Keep a global reference to prevent garbage collection
let mainWindow = null

// Where the master server lives. Mirrors DEFAULT_MASTER in shared/websocket.ts
// (this file cannot import TypeScript); change both together. Pointing the app at
// a remote master later starts here.
const MASTER = {
  host: '127.0.0.1',
  httpPort: Number(process.env.MACROTOUCH_HTTP_PORT || 4321),
  wsPort: Number(process.env.WS_PORT || 4322),
}
const MASTER_URL = `http://${MASTER.host}:${MASTER.httpPort}`

// Set only when this app started the master, so only then does it stop it on quit.
let masterProcess = null
let quitting = false

function isDevelopmentMode() {
  const envIsDev = process.env.NODE_ENV !== 'production'
  const appIsPackaged = app.isPackaged
  return envIsDev && !appIsPackaged
}

function isMasterRunning() {
  return new Promise((resolve) => {
    const req = http.get({ host: MASTER.host, port: MASTER.httpPort, path: '/api/ip', timeout: 1000 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(false))
  })
}

async function waitForMaster(timeout = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await isMasterRunning()) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Master server did not start on ${MASTER.host}:${MASTER.httpPort} in ${timeout}ms`)
}

async function ensureMaster() {
  if (await isMasterRunning()) {
    console.log(`Using master server already running at ${MASTER_URL}`)
    return
  }

  const appRoot = app.isPackaged ? app.getAppPath() : path.join(__dirname, '..')
  const entry = path.join(appRoot, 'dist-master', 'index.mjs')
  if (!fs.existsSync(entry)) {
    throw new Error(`Master server bundle not found at ${entry}; run "npm run build:master"`)
  }

  console.log(`Starting master server from ${entry}`)
  // Detached so the master is its own process, not tied to this window's lifetime.
  masterProcess = spawn(process.execPath, [entry], {
    cwd: appRoot,
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      MACROTOUCH_STATIC_DIR: path.join(appRoot, '.output', 'public'),
    },
  })
  masterProcess.unref()
  masterProcess.on('error', (err) => console.error('Master server failed to start:', err))
  masterProcess.on('exit', (code, signal) => {
    console.log(`Master server exited: code=${code} signal=${signal}`)
    masterProcess = null
  })

  await waitForMaster()
}

/** Asks the master to shut down over the websocket; falls back to killing it. */
function stopMaster() {
  const child = masterProcess
  if (!child) return Promise.resolve()

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM')
      } catch {
        // Already gone.
      }
      resolve()
    }, 2000)

    try {
      const socket = new WebSocket(`ws://${MASTER.host}:${MASTER.wsPort}`)
      socket.onopen = () => socket.send(JSON.stringify({ type: 'quit' }))
      socket.onclose = done
      socket.onerror = () => {}
      child.once('exit', done)
    } catch (err) {
      console.error('Failed to ask the master to quit:', err)
      done()
    }
  })
}

function createWindow() {
  // Calculate window size relative to screen size
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds
  const windowWidth = Math.floor(screenWidth * 0.8) // 80% of screen width
  const windowHeight = Math.floor(screenHeight * 0.8) // 80% of screen height

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 800,
    minHeight: 600,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (mainWindow && mainWindow.setIcon) {
    mainWindow.setIcon(appIcon)
  }

  const isDev = isDevelopmentMode()
  console.log('Electron startup mode:', { isDev, NODE_ENV: process.env.NODE_ENV, isPackaged: app.isPackaged })

  if (isDev) {
    // In development, load from the Nuxt dev server
    mainWindow.loadURL(`${process.env.NUXT_DEV_URL || 'http://127.0.0.1:4321'}/home`)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadURL(`${MASTER_URL}/home`)
  }

  // Open external links in the default browser instead of Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.macrotouch.app')
  }

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIcon)
  }

  try {
    await ensureMaster()
  } catch (err) {
    console.error('Failed to start master server:', err)
  }

  createWindow()

  // IPC handlers
  ipcMain.on('macro:trigger', (event, macroId) => {
    console.log(`Macro triggered: ${macroId}`)
    // TODO: Implement actual macro execution (e.g., simulate keystrokes)
  })

  app.on('activate', () => {
    // On macOS, re-create the window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  ipcMain.handle('dialog:selectExecutable', async () => {
    const platform = process.platform
    let defaultPath = undefined
    let filters = []

    if (platform === 'darwin') {
      defaultPath = '/Applications'
      filters = [{ name: 'Applications', extensions: ['app'] }]
    } else if (platform === 'win32') {
      defaultPath = process.env.SystemRoot || 'C:\\Windows'
      filters = [{ name: 'Executables', extensions: ['exe', 'bat', 'cmd', 'com'] }]
    } else {
      // Linux and others
      defaultPath = '/usr/bin'
      filters = [{ name: 'Executables', extensions: ['exe', 'sh', 'desktop'] }]
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select executable or application',
      defaultPath,
      properties: ['openFile'],
      filters,
    })

    if (canceled || !filePaths || filePaths.length === 0) {
      return null
    }

    return filePaths[0]
  })
})

app.on('window-all-closed', () => {
  // On macOS, keep the app running until Command+Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (quitting || !masterProcess) return
  // Hold the quit until the master has been asked to stop.
  event.preventDefault()
  quitting = true
  stopMaster().finally(() => app.quit())
})

process.on('SIGINT', () => app.quit())
process.on('SIGTERM', () => app.quit())
