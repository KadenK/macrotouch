import { WebSocketServer } from 'ws'
import type { Macro } from '../shared/types'
import type { MasterToClientMessage, ProtocolError, ProtocolRole, StateCommand } from '../shared/protocol'
import { PROTOCOL_VERSION } from '../shared/protocol'
import { ActionStateHub } from './action-state'
import { ActionRouter } from './action-router'
import { NodeRegistry } from './node-registry'
import { isLoopback, type PairingToken } from './pairing'
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
  /** The screen a controller is showing, which decides the actions watched for it. */
  viewedScreenId: string | null
  /** From this computer, so exempt from the pairing token and allowed to quit. */
  fromLoopback: boolean
}

const COMMAND_TYPES = new Set<StateCommand['type']>([
  'upsert-macro',
  'delete-macro',
  'move-macro',
  'upsert-screen',
  'delete-screen',
  'update-settings',
])

export type GatewayOptions = {
  /** Shared with the HTTP server, so a regeneration takes effect on both at once. */
  pairing: PairingToken
  /** Called when Electron on this computer asks the master to stop. */
  onQuit?: () => void
}

export function startGateway(port: number, options: GatewayOptions) {
  const { pairing } = options
  const stateFile = new StateFile()
  const store = new StateStore(stateFile.load())
  const nodes = new NodeRegistry()
  const router = new ActionRouter(nodes)

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

  const actionState = new ActionStateHub(
    nodes,
    () => store.getState(),
    function* viewedScreens() {
      for (const { role, viewedScreenId } of clients.values()) {
        if (role === 'controller' && viewedScreenId) yield viewedScreenId
      }
    },
    (msg) => {
      for (const { socket, role } of clients.values()) {
        if (role === 'controller') send(socket, msg)
      }
    },
  )

  const send = (socket: WebSocketConnection, msg: MasterToClientMessage) => {
    if (socket.readyState === 1) socket.send(JSON.stringify(msg))
  }

  const sendError = (socket: WebSocketConnection, error: ProtocolError, requestId?: string) =>
    send(socket, { type: 'error', error, ...(requestId ? { requestId } : {}) })

  /** Patches go to every editor and controller, the sender included. */
  const broadcast = (msg: MasterToClientMessage) => {
    for (const { socket, role } of clients.values()) {
      if (role !== 'node') send(socket, msg)
    }
  }

  // An action server usually registers after the editor's snapshot, so editors
  // are told whenever the set of catalogs changes.
  nodes.onChange(() => {
    for (const { socket, role } of clients.values()) {
      if (role === 'editor') send(socket, { type: 'catalogs', catalogs: nodes.catalogs() })
    }
    actionState.recompute()
  })

  /**
   * Close every connection that came from another device.
   *
   * Called after a regeneration: those clients hold a token that is no longer
   * valid, and leaving them connected would let a revoked device keep running
   * macros until it happened to disconnect.
   */
  const dropRemoteClients = () => {
    for (const { socket, fromLoopback: local } of clients.values()) {
      if (local) continue
      sendError(socket, { code: 'invalid-token', message: 'The pairing token was regenerated' })
      try {
        socket.close()
      } catch {
        // Already gone.
      }
    }
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

  wss.on('connection', (socket: WebSocketConnection, req: { socket: { remoteAddress?: string } }) => {
    const fromLoopback = isLoopback(req.socket.remoteAddress)
    const client: Client = { socket, role: null, viewedScreenId: null, fromLoopback }
    clients.set(socket, client)
    console.log('WebSocket client connected')

    socket.on('message', (raw: { toString(): string }) => {
      const msg = parseClientMessage(raw.toString())

      if (isProtocolError(msg)) {
        console.warn('Invalid websocket message:', msg.message)
        sendError(socket, msg)
        return
      }

      if (msg.type === 'quit') {
        if (fromLoopback) options.onQuit?.()
        else sendError(socket, { code: 'invalid-message', message: 'quit is only accepted from this computer' })
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

        // Every role is gated the same way. A connection from this computer is
        // trusted by its address: the desktop editor and the MacroPad window
        // both arrive on the loopback interface and carry no token.
        if (!fromLoopback && !pairing.verify(msg.token)) {
          const error: ProtocolError = {
            code: 'invalid-token',
            message: 'This device is not paired with this computer',
          }
          console.warn(`[Pairing] refused a ${msg.role} connection with ${msg.token ? 'a stale' : 'no'} token`)
          sendError(socket, error)
          socket.close()
          return
        }

        if (msg.role === 'node') {
          // Temporary local-only security measure until we have a proper authentication system. Nodes are only accepted from this computer.
          if (!fromLoopback) {
            sendError(socket, {
              code: 'invalid-message',
              message: 'node connections are only accepted from this computer',
            })
            socket.close()
            return
          }
          client.role = 'node'
          nodes.register(socket, msg)
          return
        }

        nodes.remove(socket)
        client.role = msg.role
        if (msg.role === 'controller' && msg.screenId) client.viewedScreenId = msg.screenId

        const isLocalEditor = msg.role === 'editor' && fromLoopback
        const cachedState = msg.role === 'controller' ? actionState.snapshot() : undefined
        send(socket, {
          type: 'snapshot',
          protocolVersion: PROTOCOL_VERSION,
          state: store.getState(),
          ...(msg.role === 'editor' ? { catalogs: nodes.catalogs() } : {}),
          // The connect page needs the token to build the URL it advertises.
          ...(isLocalEditor ? { pairingToken: pairing.value } : {}),
          // Absent, not empty, when no node is connected to produce any.
          ...(cachedState ? { actionState: cachedState } : {}),
        })
        if (client.viewedScreenId) actionState.recompute()
        return
      }

      if (client.role === null) {
        console.warn('Message received before hello:', msg.type)
        sendError(socket, { code: 'invalid-message', message: 'Expected hello first' })
        return
      }

      if (msg.type === 'action-result') {
        if (client.role === 'node') console.log(`[action-server] action ${msg.requestId}: ${msg.ok ? 'ok' : 'error'}`)
        else sendError(socket, { code: 'invalid-message', message: 'action-result requires a node connection' })
        return
      }

      if (msg.type === 'action-state') {
        if (client.role === 'node') actionState.ingest(socket, msg.states)
        else sendError(socket, { code: 'invalid-message', message: 'action-state requires a node connection' })
        return
      }

      if (client.role === 'node') {
        sendError(socket, { code: 'invalid-message', message: 'node message is not supported' })
        return
      }

      if (msg.type === 'macro-trigger') {
        const macro: Macro | undefined = store.getState().macros[msg.macroId]
        if (!macro) {
          console.warn('Received macro trigger for unknown macro ID', msg.macroId)
          return
        }
        router.trigger(macro)
        return
      }

      if (msg.type === 'view-screen') {
        client.viewedScreenId = msg.screenId
        actionState.recompute()
        return
      }

      if (msg.type === 'regenerate-token') {
        if (!fromLoopback || client.role !== 'editor') {
          sendError(socket, {
            code: 'invalid-message',
            message: 'regenerate-token is only accepted from an editor on this computer',
          })
          return
        }
        const token = pairing.regenerate()
        dropRemoteClients()
        // Local editors get the new token so the connect page can redraw its QR
        // without reconnecting.
        for (const { socket: peer, role, fromLoopback: local } of clients.values()) {
          if (role === 'editor' && local) send(peer, { type: 'pairing-token', token })
        }
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
        // The edit may have bound, unbound or moved a stateful macro on a viewed screen.
        actionState.recompute()
      }
    })

    socket.on('close', () => {
      nodes.remove(socket)
      clients.delete(socket)
      if (client.role === 'controller' && client.viewedScreenId) actionState.recompute()
      console.log('WebSocket client disconnected')
    })
  })

  wss.on('close', shutdown)

  // Kept deliberately unconditional to match the pre-MAC-40 log (ST-07 quirk);
  // `listening` is tracked so a follow-up ticket can make this honest.
  void listening
  console.log(`WebSocket server started on port ${port}`)

  return { store, stateFile, nodes, broadcast, shutdown }
}
