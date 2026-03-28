'use strict'

const { app, BrowserWindow, shell, ipcMain, screen, nativeImage } = require('electron')
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const appIconPath = path.join(__dirname, '..', 'images', 'macrotouch-logo.png')
const appIcon = nativeImage.createFromPath(appIconPath)

// Keep a global reference to prevent garbage collection
let mainWindow = null

let nuxtProcess = null
// For external client access, bind to all interfaces. For local app URL, use localhost.
const SERVER_BIND_HOST = '0.0.0.0'
const LOCAL_URL_HOST = '127.0.0.1'
const LOCAL_PORT = 4321

function isDevelopmentMode() {
  const envIsDev = process.env.NODE_ENV !== 'production'
  const appIsPackaged = app.isPackaged
  return envIsDev && !appIsPackaged
}

function waitForServer(host, port, timeout = 15000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.request({ method: 'HEAD', host, port, path: '/' }, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', (err) => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Server did not start on ${host}:${port} in ${timeout}ms`))
        } else {
          setTimeout(check, 200)
        }
      })
      req.end()
    }
    check()
  })
}

async function startNuxtServer() {
  if (isDevelopmentMode()) {
    return
  }

  if (nuxtProcess) {
    return
  }

  const appRoot = app.isPackaged ? app.getAppPath() : path.join(__dirname, '..')
  const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  console.log(`Starting Nuxt server from ${appRoot} on ${SERVER_BIND_HOST}:${LOCAL_PORT}`)

  nuxtProcess = spawn(runner, ['nuxi', 'preview', '--port', `${LOCAL_PORT}`], {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', NITRO_HOST: SERVER_BIND_HOST },
  })

  nuxtProcess.stdout.on('data', (data) => {
    console.log(`[nuxt] ${data.toString().trim()}`)
  })
  nuxtProcess.stderr.on('data', (data) => {
    console.error(`[nuxt] ${data.toString().trim()}`)
  })

  nuxtProcess.on('exit', (code, signal) => {
    console.log(`Nuxt preview process exited: code=${code} signal=${signal}`)
    nuxtProcess = null
  })

  nuxtProcess.on('error', (err) => {
    console.error('Nuxt preview process failed:', err)
  })

  await waitForServer(LOCAL_URL_HOST, LOCAL_PORT)
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
    const devUrl = process.env.NUXT_DEV_URL || `http://${LOCAL_URL_HOST}:${LOCAL_PORT}`
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools()
  } else {
    // In production, use local host for in-app instance while server binds all interfaces for external clients
    mainWindow.loadURL(`http://${LOCAL_URL_HOST}:${LOCAL_PORT}/#home`)
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
    await startNuxtServer()
  } catch (err) {
    console.error('Failed to start Nuxt server:', err)
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
})

app.on('window-all-closed', () => {
  // On macOS, keep the app running until Command+Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (nuxtProcess) {
    nuxtProcess.kill()
    nuxtProcess = null
  }
})
