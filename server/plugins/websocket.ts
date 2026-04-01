import { WebSocketServer } from 'ws'
import type { Macro, MacroState, WebSocketMessage } from '../../types'
import { handleMacroTrigger } from '../util/handleMacro'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { WEBSOCKET_PORT } from '../../shared/websocket'

type MacroTouchGlobalScope = typeof globalThis & {
  __macroTouchWebSocketServerStarted?: boolean
  broadcast?: (data: WebSocketMessage) => void
  macroState?: MacroState
  saveMacroState?: () => void
}

type WebSocketConnection = {
  readyState: number
  send(data: string): void
  close(): void
  on(event: 'message', listener: (message: { toString(): string }) => void): void
  on(event: 'close', listener: () => void): void
}

export default defineNitroPlugin(() => {
  // Run one websocket server once even if plugin runs in multiple contexts
  const globalScope = globalThis as MacroTouchGlobalScope

  if (globalScope.__macroTouchWebSocketServerStarted) {
    return
  }
  globalScope.__macroTouchWebSocketServerStarted = true

  const WS_PORT = Number(process.env.WS_PORT || process.env.NUXT_WS_PORT || WEBSOCKET_PORT)

  const dataRoot =
    process.env.MACROTOUCH_DATA_DIR || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.macroTouch')
  try {
    fs.mkdirSync(dataRoot, { recursive: true })
  } catch (err) {
    console.error('[WebSocket] cannot create data directory', dataRoot, err)
  }

  const stateFilePath = path.join(dataRoot, 'state.json')

  const wss = new WebSocketServer({ port: WS_PORT })
  wss.on('error', (err: { code?: string }) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[WebSocket] port ${WS_PORT} already in use, skipping websocket server startup`)
      return
    }
    throw err
  })

  const clients = new Set<WebSocketConnection>()
  let isShuttingDown = false

  const shutdown = () => {
    if (isShuttingDown) {
      return
    }

    isShuttingDown = true

    for (const client of clients) {
      try {
        client.close()
      } catch {
        // Ignore shutdown errors.
      }
    }

    try {
      wss.close()
    } catch {
      // Ignore shutdown errors.
    }
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  process.once('beforeExit', shutdown)

  // Ensure the data directory exists
  try {
    fs.mkdirSync(path.dirname(stateFilePath), { recursive: true })
  } catch (err) {
    console.error('Failed to create data directory:', err)
  }

  // Load state from file or start with empty object
  let state: MacroState = { macros: {}, screens: {} }
  try {
    const data = fs.readFileSync(stateFilePath, 'utf-8')
    state = JSON.parse(data)
    console.log('Loaded state from file')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Error reading state file:', err)
    }
    // File doesn't exist, start fresh
  }

  // Save state to file (async, non‑blocking)
  const saveState = () => {
    let data
    try {
      data = JSON.stringify(state, null, 2) // This can throw (synchronous)
    } catch (err) {
      console.error('Failed to stringify state:', err)
      return
    }

    // This is non-blocking - returns immediately
    fs.writeFile(stateFilePath, data, 'utf-8', (err) => {
      if (err) console.error('Failed to save state:', err) // Handle async errors here
    })
  }

  // Broadcast to all connected clients
  const broadcast = (data: WebSocketMessage) => {
    clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(data))
      }
    })
  }

  // Expose state, broadcast, and save for API routes
  globalScope.broadcast = broadcast
  globalScope.macroState = state
  globalScope.saveMacroState = saveState

  const sendState = (ws: WebSocketConnection) => {
    ws.send(JSON.stringify({ type: 'state', state }))
  }

  wss.on('connection', (ws: WebSocketConnection) => {
    clients.add(ws)
    console.log('WebSocket client connected')

    // Send current state immediately
    sendState(ws)

    ws.on('message', async (message: { toString(): string }) => {
      let data: WebSocketMessage | undefined
      try {
        data = JSON.parse(message.toString())
      } catch (err) {
        console.warn('Invalid websocket message', err)
        return
      }

      if (!data || typeof data !== 'object' || !('type' in data)) return

      if (data.type === 'state-update') {
        if (data.state) {
          Object.assign(state, data.state)
          broadcast({ type: 'state', state })
          // Persist the updated state
          saveState()
        }
      } else if (data.type === 'macro-trigger') {
        const macro: Macro | undefined = state.macros[data.id]
        if (!macro) {
          console.warn('Received macro trigger for unknown macro ID', data.id)
          return
        }
        handleMacroTrigger(macro)
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log('WebSocket client disconnected')
    })
  })

  wss.on('close', () => {
    shutdown()
  })

  console.log(`WebSocket server started on port ${WS_PORT}`)
})
