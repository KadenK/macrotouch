import type { ActionStateMessage, WatchActions } from '../shared/protocol'
import type { ActionStateEntry, ActionStateKey, MacroState, WatchedAction } from '../shared/types'
import { actionStateKey } from '../shared/types/actionState'
import type { NodeRegistry, NodeSocket } from './node-registry'

/**
 * Decides which actions each Action Server watches, and relays what they report.
 *
 * The watched set is every stateful action on a screen some controller is
 * viewing. It is recomputed whenever that could change — a controller moves or
 * leaves, a command edits a macro, a node comes or goes — and a node is only
 * told when its own set actually changes.
 *
 * Every reading goes to every controller. The latest reading of each watched
 * action is kept, in memory only, so a controller that connects later gets it
 * in its snapshot; it is dropped once the action stops being watched or its
 * node disconnects.
 */
export class ActionStateHub {
  /** The latest reading of each watched action. */
  private cache = new Map<ActionStateKey, ActionStateEntry>()
  /** What each node was last told to watch. */
  private watching = new Map<NodeSocket, Set<ActionStateKey>>()

  constructor(
    private readonly nodes: NodeRegistry,
    private readonly getState: () => MacroState,
    private readonly viewedScreens: () => Iterable<string>,
    private readonly sendToControllers: (msg: ActionStateMessage) => void,
  ) {}

  /** The latest reading of each watched action, or `undefined` when no node is connected to produce any. */
  snapshot(): Record<ActionStateKey, ActionStateEntry> | undefined {
    if (!this.nodes.hasAny()) return undefined
    return Object.fromEntries(this.cache)
  }

  recompute(): void {
    const { screens, macros } = this.getState()
    const wanted = new Map<NodeSocket, Map<ActionStateKey, WatchedAction>>()

    for (const screenId of new Set(this.viewedScreens())) {
      const screen = screens[screenId]
      if (!screen) continue
      for (const row of screen.macroRows) {
        for (const macroId of row.macrosIds) {
          const macro = macroId ? macros[macroId] : undefined
          if (!macro?.actionId) continue
          const socket = this.nodes.findStateful(macro.actionId, macro.parameters)
          if (!socket) continue
          const key = actionStateKey(macro.actionId, macro.parameters)
          let list = wanted.get(socket)
          if (!list) wanted.set(socket, (list = new Map()))
          list.set(key, {
            key,
            actionId: macro.actionId,
            ...(macro.parameters ? { parameters: macro.parameters } : {}),
          })
        }
      }
    }

    // Nodes that disconnected: their readings can no longer be trusted.
    const live = new Set(this.nodes.sockets())
    for (const socket of [...this.watching.keys()]) {
      if (!live.has(socket)) this.forget(socket)
    }

    for (const socket of live) {
      const list = wanted.get(socket) ?? new Map<ActionStateKey, WatchedAction>()
      const before = this.watching.get(socket) ?? new Set()
      const after = new Set(list.keys())
      if (sameSet(before, after)) continue

      // A node that stops watching a key stops refreshing it, so drop the reading.
      for (const key of before) if (!after.has(key)) this.cache.delete(key)
      this.watching.set(socket, after)
      const message: WatchActions = {
        type: 'watch-actions',
        actions: [...list.values()],
      }
      if (socket.readyState === 1) socket.send(JSON.stringify(message))
    }
  }

  /** Readings from one node. Keys it was not asked about are ignored. */
  ingest(socket: NodeSocket, states: ActionStateEntry[]): void {
    const watched = this.watching.get(socket)
    if (!watched) return
    const accepted = states.filter((entry) => watched.has(entry.key))
    if (!accepted.length) return
    for (const entry of accepted) this.cache.set(entry.key, entry)
    this.sendToControllers({ type: 'action-state', states: accepted })
  }

  /** Clear a departed node's readings, and tell controllers they are now unknown. */
  private forget(socket: NodeSocket): void {
    const keys = this.watching.get(socket) ?? new Set()
    this.watching.delete(socket)
    const cleared: ActionStateEntry[] = []
    for (const key of keys) {
      const entry = this.cache.get(key)
      if (!entry) continue
      this.cache.delete(key)
      cleared.push({
        ...entry,
        value: null,
        appearance: undefined,
        updatedAt: Date.now(),
      })
    }
    if (cleared.length) this.sendToControllers({ type: 'action-state', states: cleared })
  }
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}
