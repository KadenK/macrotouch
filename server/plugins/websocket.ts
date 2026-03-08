import { WebSocketServer } from 'ws'

export default defineNitroPlugin((nitroApp) => {
  const wss = new WebSocketServer({ port: 3001 })

  const clients = new Set()

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log('WebSocket client connected')

    ws.on('message', (message) => {
      // Handle incoming messages if needed
      console.log('Received:', message.toString())
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log('WebSocket client disconnected')
    })
  })

  // Function to broadcast to all clients
  globalThis.broadcast = (data) => {
    clients.forEach((client) => {
      if (client.readyState === 1) { // OPEN
        client.send(JSON.stringify(data))
      }
    })
  }

  console.log('WebSocket server started on port 3001')
})
