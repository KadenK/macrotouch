'use strict'

const { app, BrowserWindow, shell, ipcMain, screen, nativeImage, dialog, Notification } = require('electron')
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

let nuxtProcess = null
let shutdownInProgress = false
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
      req.on('error', () => {
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

const NOTIFICATION_SERVER_HOST = '127.0.0.1'
const NOTIFICATION_SERVER_PORT = process.env.NOTIFICATION_SERVER_PORT
  ? parseInt(process.env.NOTIFICATION_SERVER_PORT, 10)
  : 4323
let notificationHttpServer = null

function stopNuxtServer() {
  if (!nuxtProcess || shutdownInProgress) {
    return
  }

  shutdownInProgress = true

  const { pid } = nuxtProcess
  if (!pid) {
    nuxtProcess = null
    shutdownInProgress = false
    return
  }

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', `${pid}`, '/T', '/F'], {
      stdio: 'ignore',
    })

    killer.on('exit', () => {
      nuxtProcess = null
      shutdownInProgress = false
    })

    killer.on('error', (err) => {
      console.error('Failed to stop Nuxt server tree:', err)
      try {
        nuxtProcess.kill('SIGTERM')
      } catch (killErr) {
        console.error('Failed to stop Nuxt server process:', killErr)
      }
      nuxtProcess = null
      shutdownInProgress = false
    })

    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch (err) {
    console.error('Failed to stop Nuxt server process group:', err)
    try {
      nuxtProcess.kill('SIGTERM')
    } catch (killErr) {
      console.error('Failed to stop Nuxt server process:', killErr)
    }
  }

  setTimeout(() => {
    if (nuxtProcess && nuxtProcess.pid === pid) {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        // Ignore if the process group already exited.
      }
      try {
        nuxtProcess.kill('SIGKILL')
      } catch {
        // Ignore if the process already exited.
      }
    }
    nuxtProcess = null
    shutdownInProgress = false
  }, 1500)
}

function startNotificationServer() {
  if (notificationHttpServer) {
    return
  }

  notificationHttpServer = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/notify') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })

    req.on('end', () => {
      try {
        const message = JSON.parse(body)
        if (!message || typeof message !== 'object') {
          throw new Error('Invalid notification payload')
        }

        const title = typeof message.title === 'string' && message.title.trim() ? message.title.trim() : 'MacroTouch'
        const bodyText = typeof message.message === 'string' ? message.message : ''

        try {
          new Notification({ title, body: bodyText, silent: false }).show()
          res.writeHead(204)
          res.end()
        } catch (err) {
          console.error('Failed to show notification from dev server:', err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Failed to show notification' }))
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Invalid payload' }))
      }
    })
  })

  notificationHttpServer.on('error', (err) => {
    console.error('Notification server failed:', err)
  })

  notificationHttpServer.listen(NOTIFICATION_SERVER_PORT, NOTIFICATION_SERVER_HOST, () => {
    console.log(
      `Notification server listening on http://${NOTIFICATION_SERVER_HOST}:${NOTIFICATION_SERVER_PORT}/notify`,
    )
  })
}

function stopNotificationServer() {
  if (!notificationHttpServer) {
    return
  }

  notificationHttpServer.close(() => {
    notificationHttpServer = null
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
  const serverEntry = path.join(appRoot, '.output', 'server', 'index.mjs')
  console.log(`Starting Nuxt server from ${appRoot} on ${SERVER_BIND_HOST}:${LOCAL_PORT}`)

  if (fs.existsSync(serverEntry)) {
    nuxtProcess = spawn(process.execPath, [serverEntry], {
      cwd: appRoot,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        NITRO_HOST: SERVER_BIND_HOST,
        PORT: `${LOCAL_PORT}`,
      },
    })
  } else {
    const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    nuxtProcess = spawn(runner, ['nuxi', 'preview', '--port', `${LOCAL_PORT}`], {
      cwd: appRoot,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      detached: process.platform !== 'win32',
      env: { ...process.env, NODE_ENV: 'production', NITRO_HOST: SERVER_BIND_HOST },
    })
  }

  if (process.platform !== 'win32') {
    nuxtProcess.unref()
  }

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

  nuxtProcess.on('message', (message) => {
    if (!message || typeof message !== 'object' || message.type !== 'notification') {
      return
    }

    const title = typeof message.title === 'string' && message.title.trim() ? message.title.trim() : 'MacroTouch'
    const body = typeof message.message === 'string' ? message.message : ''

    try {
      new Notification({ title, body, silent: false }).show()
    } catch (err) {
      console.error('Failed to show notification from Nuxt server:', err)
    }
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

  startNotificationServer()

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

  // Notification delivery comes from the Nuxt subprocess over child-process IPC.
})

app.on('window-all-closed', () => {
  // On macOS, keep the app running until Command+Q
  if (process.platform !== 'darwin') {
    stopNuxtServer()
    stopNotificationServer()
    app.quit()
  }
})

app.on('before-quit', () => {
  stopNuxtServer()
  stopNotificationServer()
})

process.on('SIGINT', () => {
  stopNuxtServer()
})

process.on('SIGTERM', () => {
  stopNuxtServer()
})
