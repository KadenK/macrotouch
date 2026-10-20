import { WebSocketServer } from 'ws'
import type { Macro } from '../../types'
import type { MasterToClientMessage, ProtocolError, ProtocolRole, StateCommand } from '../../shared/protocol'
import { PROTOCOL_VERSION } from '../../shared/protocol'
import { handleMacroTrigger } from '../util/handleMacro'
import { StateFile } from './state-file'
import { StateStore, isProtocolError } from './state-store'
import { parseClientMessage } from './validate'

/**
 * Accepts client connections and passes messages along.
 *
 * Connection lifecycle: the client sends `hello`, the master answers with
 * `snapshot`, and only then is the connection live. Anything before `hello`
 * is rejected.
 */

export type WebSocketConnection = {
  readyState: number
  send(data: string): void
  close(): void
  on(event: 'message', listener: (message: { toString(): string }) => void): void
  on(event: 'close', listener: () => void): void
}

type Client = {
  socket: WebSocketConnection
  role: ProtocolRole | null
  /** Recorded for MAC-41 (catalogs) and Demo 2 (watch tracking). Unused here. */
  viewedScreenId: string | null
}

const COMMAND_TYPES = new Set<StateCommand['type']>([
  'upsert-macro',
  'delete-macro',
  'move-macro',
  'upsert-screen',
  'delete-screen',
  'update-settings',
])

export function startGateway(port: number) {
  const stateFile = new StateFile()
  const store = new StateStore(stateFile.load())

  const wss = new WebSocketServer({ port })
  let listening = false

  wss.on('error', (err: { code?: string }) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[WebSocket] port ${port} already in use, skipping websocket server startup`)
      return
    }
    throw err
  })
  wss.on('listening', () => {
    listening = true
  })

  const clients = new Map<WebSocketConnection, Client>()
  let isShuttingDown = false

  const send = (socket: WebSocketConnection, msg: MasterToClientMessage) => {
    if (socket.readyState === 1) socket.send(JSON.stringify(msg))
  }

  const sendError = (socket: WebSocketConnection, error: ProtocolError, requestId?: string) =>
    send(socket, { type: 'error', error, ...(requestId ? { requestId } : {}) })

  /** Patches go to every client, the sender included — one apply path everywhere. */
  const broadcast = (msg: MasterToClientMessage) => {
    for (const { socket } of clients.values()) send(socket, msg)
  }

  const shutdown = () => {
    if (isShuttingDown) return
    isShuttingDown = true
    for (const { socket } of clients.values()) {
      try {
        socket.close()
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

  wss.on('connection', (socket: WebSocketConnection) => {
    const client: Client = { socket, role: null, viewedScreenId: null }
    clients.set(socket, client)
    console.log('WebSocket client connected')

    socket.on('message', (raw: { toString(): string }) => {
      const msg = parseClientMessage(raw.toString())

      if (isProtocolError(msg)) {
        console.warn('Invalid websocket message:', msg.message)
        sendError(socket, msg)
        return
      }

      if (msg.type === 'hello') {
        if (msg.protocolVersion !== PROTOCOL_VERSION) {
          const error: ProtocolError = {
            code: 'unsupported-protocol-version',
            message: `Master speaks protocol ${PROTOCOL_VERSION}, client sent ${msg.protocolVersion}`,
          }
          console.warn('[WebSocket]', error.message)
          sendError(socket, error)
          socket.close()
          return
        }

        client.role = msg.role
        if (msg.role === 'controller' && msg.screenId) client.viewedScreenId = msg.screenId

        // Demo 1 sends state only. `catalogs` arrives with the Action Server
        // (MAC-41), `actionState` with Demo 2 — an absent field means "no
        // producer", which is not the same as an empty one.
        send(socket, { type: 'snapshot', protocolVersion: PROTOCOL_VERSION, state: store.getState() })
        return
      }

      if (client.role === null) {
        console.warn('Message received before hello:', msg.type)
        sendError(socket, { code: 'invalid-message', message: 'Expected hello first' })
        return
      }

      if (msg.type === 'macro-trigger') {
        const macro: Macro | undefined = store.getState().macros[msg.macroId]
        if (!macro) {
          console.warn('Received macro trigger for unknown macro ID', msg.macroId)
          return
        }
        // Fire-and-forget, as today (RT-02). `action-result` has no producer
        // until the Action Server lands in MAC-41.
        handleMacroTrigger(macro)
        return
      }

      if (msg.type === 'view-screen') {
        // Recorded only. The watch tracker that consumes this is Demo 2.
        client.viewedScreenId = msg.screenId
        return
      }

      if (COMMAND_TYPES.has(msg.type)) {
        const result = store.applyCommand(msg)
        if (isProtocolError(result)) {
          console.warn('Command rejected:', result.message)
          sendError(socket, result)
          return
        }
        stateFile.save(store.getState())
        broadcast(result)
      }
    })

    socket.on('close', () => {
      clients.delete(socket)
      console.log('WebSocket client disconnected')
    })
  })

  wss.on('close', shutdown)

  // Kept deliberately unconditional to match the pre-MAC-40 log (ST-07 quirk);
  // `listening` is tracked so a follow-up ticket can make this honest.
  void listening
  console.log(`WebSocket server started on port ${port}`)

  return { store, stateFile, broadcast, shutdown }
}
