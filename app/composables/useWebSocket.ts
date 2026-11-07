import { useRuntimeConfig } from '#app'
import { WEBSOCKET_PORT } from '../../shared/websocket'
import { PROTOCOL_VERSION } from '../../shared/protocol'
import type {
  CatalogsMessage,
  ClientToMasterMessage,
  MasterToClientMessage,
  ProtocolError,
  ProtocolErrorCode,
  Snapshot,
  StatePatch,
} from '../../shared/protocol'

type WebSocketHandlers = {
  snapshot?: (snapshot: Snapshot) => void
  patch?: (patch: StatePatch) => void
  catalogs?: (catalogs: CatalogsMessage['catalogs']) => void
  error?: (error: ProtocolError) => void
  open?: () => void
  close?: () => void
  socketError?: (error: Event) => void
}

/** `/screen` is the touch runtime; everything else is the editor. */
const roleForPath = (pathname: string) => (pathname.startsWith('/screen') ? 'controller' : 'editor')

/**
 * Connection state as the UI needs to see it.
 *
 * `reconnecting` means the last known layout is still on screen but may be
 * stale. `offline` is terminal: the master refused this client, so retrying
 * would not help and the UI should say why.
 */
export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'offline'

/**
 * Refusals, as opposed to a dropped wire. These stop the retry loop.
 *
 * MAC-31 adds its invalid-token code here: a phone holding a stale token has to
 * stop and show the pairing screen rather than hammer the master. Every other
 * code is recoverable and leaves the connection alone.
 */
const FATAL_CODES = new Set<ProtocolErrorCode>(['unsupported-protocol-version'])

const FIRST_RETRY_MS = 500
const MAX_RETRY_MS = 15_000

const createWebSocket = () => {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const status = ref<ConnectionStatus>('connecting')
  const fatalError = ref<ProtocolError | null>(null)
  const handlers = reactive<WebSocketHandlers>({})

  // Handlers are registered once by the sync plugin and outlive any single
  // socket, so reconnecting is just a new socket plus another `hello`.
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = FIRST_RETRY_MS
  let stopped = false

  function clearRetry() {
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scheduleRetry() {
    if (stopped || fatalError.value || retryTimer !== null) return
    status.value = 'reconnecting'
    // Jitter so a roomful of clients does not retry in lockstep after a restart.
    const delay = retryDelay + Math.random() * retryDelay * 0.5
    retryTimer = setTimeout(() => {
      retryTimer = null
      openSocket()
    }, delay)
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS)
  }

  /** Skip the remaining backoff — the reason we were offline just went away. */
  function retryNow() {
    if (stopped || fatalError.value || ws.value) return
    clearRetry()
    retryDelay = FIRST_RETRY_MS
    openSocket()
  }

  function openSocket() {
    if (ws.value) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const { masterHost, websocketPort } = useRuntimeConfig().public
    const host = masterHost || window.location.hostname
    const port = websocketPort || WEBSOCKET_PORT

    if (status.value !== 'reconnecting') status.value = 'connecting'

    const socket = new WebSocket(`${protocol}//${host}:${port}`)
    ws.value = socket

    socket.onopen = () => {
      isConnected.value = true
      status.value = 'open'
      retryDelay = FIRST_RETRY_MS
      // hello first, always. The master answers with a snapshot, and the store
      // applies that wholesale — so replaying it here is what resyncs a client
      // that has been away.
      send({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        role: roleForPath(window.location.pathname),
      })
      handlers.open?.()
      console.log('WebSocket connected')
    }

    socket.onmessage = (event: MessageEvent) => {
      let data: MasterToClientMessage | undefined
      try {
        data = JSON.parse(event.data)
      } catch {
        console.warn('Received invalid websocket message')
        return
      }

      if (!data || typeof data !== 'object' || !('type' in data)) return

      switch (data.type) {
        case 'snapshot':
          handlers.snapshot?.(data)
          break
        case 'state-patch':
          handlers.patch?.(data)
          break
        case 'catalogs':
          handlers.catalogs?.(data.catalogs)
          break
        case 'error':
          // The master closes the socket straight after a fatal error, so record
          // it before `onclose` decides whether to come back.
          if (FATAL_CODES.has(data.error.code)) {
            fatalError.value = data.error
            status.value = 'offline'
            clearRetry()
          }
          handlers.error?.(data.error)
          break
        // action-state has no producer until MAC-14.
      }
    }

    socket.onclose = () => {
      isConnected.value = false
      ws.value = null
      handlers.close?.()
      if (fatalError.value) status.value = 'offline'
      else if (stopped) status.value = 'offline'
      else scheduleRetry()
      console.log('WebSocket disconnected')
    }

    socket.onerror = (error: Event) => {
      handlers.socketError?.(error)
      console.error('WebSocket error:', error)
    }
  }

  const connect = () => {
    stopped = false
    openSocket()
  }

  const disconnect = () => {
    stopped = true
    clearRetry()
    ws.value?.close()
  }

  const send = (data: ClientToMasterMessage) => {
    if (ws.value && ws.value.readyState === 1) {
      ws.value.send(JSON.stringify(data))
    }
  }

  const on = <T extends keyof WebSocketHandlers>(event: T, handler: NonNullable<WebSocketHandlers[T]>) => {
    handlers[event] = handler
  }

  if (typeof window !== 'undefined') {
    // A phone that was asleep or off the network comes back to a dead socket.
    // Both of these mean the backoff is now pointless, so collapse it.
    window.addEventListener('online', retryNow)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') retryNow()
    })
  }

  return {
    isConnected: readonly(isConnected),
    status: readonly(status),
    fatalError: readonly(fatalError),
    connect,
    disconnect,
    send,
    on,
  }
}

let singleton: ReturnType<typeof createWebSocket> | null = null

export const useWebSocket = () => {
  if (!singleton) {
    singleton = createWebSocket()
    if (typeof window !== 'undefined') {
      singleton.connect()
    }
  }
  return singleton
}
