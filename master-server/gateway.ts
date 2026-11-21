import { WebSocketServer } from 'ws'
import type { NodeHello, MasterToClientMessage, ProtocolError, ProtocolRole, StateCommand } from '../shared/protocol'
import { PluginRegistry } from './plugin-registry'
import type { Macro } from '../shared/types'
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
  'resize-macro',
  'upsert-screen',
  'delete-screen',
  'update-settings',
  'update-plugin',
  'delete-plugin',
])

export type GatewayOptions = {
  /** Shared with the HTTP server, so a regeneration takes effect on both at once. */
  pairing: PairingToken
  plugins?: PluginRegistry
  /** Called when Electron on this computer asks the master to stop. */
  onQuit?: () => void
}

export function startGateway(port: number, options: GatewayOptions) {
  const { pairing } = options
  const plugins = options.plugins ?? new PluginRegistry(new StateFile().dataRoot)
  const stateFile = new StateFile()
  const store = new StateStore(stateFile.load())
  plugins.setCurrentState(() => store.getState().plugins)
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

  const nodePlugins = new Map<WebSocketConnection, NodeHello['plugins']>()
  // Track attempts only across node hellos, not broadcasts, which may overlap in flight.
  const syncProgress = new Map<
    WebSocketConnection,
    {
      sent: Set<string>
      failures: Map<string, number>
      blocked: Set<string>
    }
  >()
  const syncNode = (socket: WebSocketConnection) => {
    const present = nodePlugins.get(socket) ?? []
    const progress = syncProgress.get(socket)!
    let bytes = 0
    let included = 0
    const desired = Object.values(store.getState().plugins ?? {})
      .filter((plugin) => plugin.enabled)
      .flatMap((plugin) => {
        const files = plugins.get(plugin.id, plugin.sha256)
        if (!files) return []
        const key = JSON.stringify([plugin.id, plugin.sha256])
        const missing = !present.some((item) => item.id === plugin.id && item.sha256 === plugin.sha256)
        const size = Object.values(files).reduce((sum, data) => sum + data.length, 0)
        const include = missing && !progress.blocked.has(key) && (included === 0 || bytes + size <= 32 * 1024 * 1024)
        if (include) {
          bytes += size
          included++
          progress.sent.add(key)
        }
        return [
          {
            id: plugin.id,
            sha256: plugin.sha256,
            settings: plugin.settings,
            ...(include ? { files } : {}),
          },
        ]
      })
    const disabled = Object.values(store.getState().plugins ?? {})
      .filter((plugin) => !plugin.enabled)
      .map((plugin) => plugin.id)
    if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'plugin-sync', plugins: desired, disabled }))
  }
  const syncAll = () => {
    for (const socket of nodePlugins.keys()) syncNode(socket)
  }

  // An action server usually registers after the editor's snapshot, so editors
  // are told whenever the set of catalogs changes.
  nodes.onChange(() => {
    for (const { socket, role } of clients.values()) {
      if (role === 'editor')
        send(socket, {
          type: 'catalogs',
          catalogs: nodes.catalogs(),
          nodes: nodes.infos(),
        })
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
      sendError(socket, {
        code: 'invalid-token',
        message: 'The pairing token was regenerated',
      })
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
    const client: Client = {
      socket,
      role: null,
      viewedScreenId: null,
      fromLoopback,
    }
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
        else
          sendError(socket, {
            code: 'invalid-message',
            message: 'quit is only accepted from this computer',
          })
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
          let progress = syncProgress.get(socket)
          if (!progress) {
            progress = {
              sent: new Set(),
              failures: new Map(),
              blocked: new Set(),
            }
            syncProgress.set(socket, progress)
          } else {
            const desired = new Set(
              Object.values(store.getState().plugins ?? {})
                .filter((plugin) => plugin.enabled)
                .map((plugin) => JSON.stringify([plugin.id, plugin.sha256])),
            )
            const present = new Set((msg.plugins ?? []).map((plugin) => JSON.stringify([plugin.id, plugin.sha256])))
            for (const key of progress.sent) {
              if (!desired.has(key) || present.has(key)) {
                progress.failures.delete(key)
                continue
              }
              const failures = (progress.failures.get(key) ?? 0) + 1
              progress.failures.set(key, failures)
              if (failures >= 2 && !progress.blocked.has(key)) {
                progress.blocked.add(key)
                console.warn(`[plugins] Node ${msg.nodeId} did not install ${key}; suppressing retries`)
              }
            }
            for (const key of progress.blocked) if (!desired.has(key) || present.has(key)) progress.blocked.delete(key)
            for (const key of progress.failures.keys())
              if (!desired.has(key) || present.has(key)) progress.failures.delete(key)
            progress.sent.clear()
          }
          nodePlugins.set(socket, msg.plugins)
          nodes.register(socket, msg)
          syncNode(socket)
          return
        }

        nodePlugins.delete(socket)
        syncProgress.delete(socket)
        router.disconnect(socket)
        nodes.remove(socket)
        client.role = msg.role
        if (msg.role === 'controller' && msg.screenId) client.viewedScreenId = msg.screenId

        const isLocalEditor = msg.role === 'editor' && fromLoopback
        const cachedState = msg.role === 'controller' ? actionState.snapshot() : undefined
        send(socket, {
          type: 'snapshot',
          protocolVersion: PROTOCOL_VERSION,
          state: store.getState(),
          ...(msg.role === 'editor' ? { catalogs: nodes.catalogs(), nodes: nodes.infos() } : {}),
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
        sendError(socket, {
          code: 'invalid-message',
          message: 'Expected hello first',
        })
        return
      }

      if (msg.type === 'action-result') {
        if (client.role === 'node') router.result(socket, msg)
        else
          sendError(socket, {
            code: 'invalid-message',
            message: 'action-result requires a node connection',
          })
        return
      }

      if (msg.type === 'action-state') {
        if (client.role === 'node') actionState.ingest(socket, msg.states)
        else
          sendError(socket, {
            code: 'invalid-message',
            message: 'action-state requires a node connection',
          })
        return
      }

      if (client.role === 'node') {
        sendError(socket, {
          code: 'invalid-message',
          message: 'node message is not supported',
        })
        return
      }

      if (msg.type === 'install-plugin') {
        if (!fromLoopback || client.role !== 'editor') {
          send(socket, {
            type: 'action-result',
            requestId: msg.requestId,
            ok: false,
            error: { code: 'forbidden', message: 'Local editor required' },
          })
          return
        }
        try {
          const plugin = plugins.install(msg.files, store.getState().plugins)
          const patch = store.upsertPlugin(plugin)
          stateFile.save(store.getState())
          broadcast(patch)
          syncAll()
          send(socket, {
            type: 'action-result',
            requestId: msg.requestId,
            ok: true,
            value: plugin,
          })
        } catch (error) {
          send(socket, {
            type: 'action-result',
            requestId: msg.requestId,
            ok: false,
            error: {
              code: 'invalid-plugin',
              message: error instanceof Error ? error.message : 'Invalid plugin',
            },
          })
        }
        return
      }
      if (msg.type === 'plugin-secrets') {
        if (!fromLoopback || client.role !== 'editor') {
          sendError(socket, {
            code: 'forbidden',
            message: 'Local editor required',
          })
          return
        }
        const targets =
          msg.nodeId === 'all'
            ? nodes.sockets()
            : [nodes.getById(msg.nodeId)?.socket].filter((target) => target !== undefined)
        if (msg.nodeId !== 'all' && !targets.length) {
          sendError(socket, {
            code: 'node-offline',
            message: 'Action server is offline',
          })
          return
        }
        for (const target of targets) if (target.readyState === 1) target.send(JSON.stringify(msg))
        return
      }
      if (msg.type === 'list-options' || msg.type === 'test-plugin') {
        if (client.role !== 'editor') {
          sendError(socket, { code: 'forbidden', message: 'Editor required' }, msg.requestId)
          return
        }
        router.forward(msg, socket)
        return
      }

      if (msg.type === 'macro-trigger') {
        const macro: Macro | undefined = store.getState().macros[msg.macroId]
        if (!macro) {
          console.warn('Received macro trigger for unknown macro ID', msg.macroId)
          return
        }
        router.trigger(macro, msg.requestId, socket, msg.value)
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
        if (
          (msg.type === 'update-plugin' || msg.type === 'delete-plugin') &&
          (!fromLoopback || client.role !== 'editor')
        ) {
          sendError(socket, {
            code: 'forbidden',
            message: 'Local editor required',
          })
          return
        }
        const result = store.applyCommand(msg)
        if (isProtocolError(result)) {
          console.warn('Command rejected:', result.message)
          sendError(socket, result)
          return
        }
        if (msg.type === 'delete-plugin') plugins.delete(msg.pluginId)
        stateFile.save(store.getState())
        broadcast(result)
        if (msg.type === 'delete-plugin' || msg.type === 'update-plugin') syncAll()
        // The edit may have bound, unbound or moved a stateful macro on a viewed screen.
        actionState.recompute()
      }
    })

    socket.on('close', () => {
      router.disconnect(socket)
      nodePlugins.delete(socket)
      syncProgress.delete(socket)
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
