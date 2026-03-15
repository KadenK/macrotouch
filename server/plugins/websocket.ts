import { WebSocketServer } from 'ws'

type MacroState = {
  macros: Record<string, unknown>
  screens: Record<string, unknown>
}

type WSMessage =
  | { type: 'state'; state: MacroState }
  | { type: 'state-update'; state: MacroState }
  | { type: 'macro-trigger'; id: string }

export default defineNitroPlugin(() => {
  const wss = new WebSocketServer({ port: 3001 })

  const clients = new Set<any>()

  const state: MacroState = {
    macros: {},
    screens: {},
  }

  const broadcast = (data: WSMessage) => {
    clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(data))
      }
    })
  }

  globalThis.broadcast = broadcast

  const sendState = (ws: any) => {
    ws.send(JSON.stringify({ type: 'state', state }))
  }

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log('WebSocket client connected')

    // Send current state immediately so clients can sync
    sendState(ws)

    ws.on('message', (message) => {
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
        }
      } else if (data.type === 'macro-trigger') {
        if (typeof data.id === 'string') {
          broadcast({ type: 'macro-trigger', id: data.id })
        }
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log('WebSocket client disconnected')
    })
  })

  console.log('WebSocket server started on port 3001')
})
