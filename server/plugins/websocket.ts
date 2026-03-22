import { WebSocketServer } from 'ws'
import type { Macro } from '../../types'
import { handleMacroTrigger } from '../util/handleMacro'
import fs from 'fs/promises'
import path from 'path'

type MacroState = {
  macros: Record<string, Macro>
  screens: Record<string, unknown>
}

type WSMessage =
  | { type: 'state'; state: MacroState }
  | { type: 'state-update'; state: MacroState }
  | { type: 'macro-trigger'; id: string }

export default defineNitroPlugin(async () => {
  const wss = new WebSocketServer({ port: 3001 })
  const clients = new Set<any>()

  // Path to the persistent state file
  const stateFilePath = path.join(process.cwd(), 'data', 'state.json')

  // Ensure the data directory exists
  try {
    await fs.mkdir(path.dirname(stateFilePath), { recursive: true })
  } catch (err) {
    console.error('Failed to create data directory:', err)
  }

  // Load state from file or start with empty object
  let state: MacroState = { macros: {}, screens: {} }
  try {
    const data = await fs.readFile(stateFilePath, 'utf-8')
    state = JSON.parse(data)
    console.log('Loaded state from file')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Error reading state file:', err)
    }
    // File doesn't exist, start fresh
  }

  // Save state to file (async, non‑blocking)
  const saveState = async () => {
    try {
      await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save state:', err)
    }
  }

  // Broadcast to all connected clients
  const broadcast = (data: WSMessage) => {
    clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(data))
      }
    })
  }

  // Expose state, broadcast, and save for API routes
  ;(globalThis as any).broadcast = broadcast
  ;(globalThis as any).macroState = state
  ;(globalThis as any).saveMacroState = saveState

  const sendState = (ws: any) => {
    ws.send(JSON.stringify({ type: 'state', state }))
  }

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log('WebSocket client connected')

    // Send current state immediately
    sendState(ws)

    ws.on('message', async (message) => {
      let data: WSMessage | undefined
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
          await saveState()
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

  console.log('WebSocket server started on port 3001')
})