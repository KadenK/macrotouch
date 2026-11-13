import type { ActionStateEntry, ActionStateKey, ActionStateValue, NodeId, WatchedAction } from '../shared/types'
import { findActionState } from '../shared/types/action'
import { actions } from './action-map'

const POLL_INTERVAL_MS = 1000

/**
 * Polls the actions the master asked about and reports the readings that changed.
 *
 * Only watched actions are read, so a screen nobody is looking at costs
 * nothing. Polls never overlap: a slow shell call delays the next round rather
 * than stacking up behind it.
 */
export class StateMonitor {
  private watched = new Map<ActionStateKey, WatchedAction>()
  private last = new Map<ActionStateKey, ActionStateValue>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private polling: Promise<void> | null = null
  private stopped = false

  constructor(
    private readonly nodeId: NodeId,
    private readonly report: (states: ActionStateEntry[]) => void,
  ) {}

  /** Replace the watched set. Newly watched actions are read straight away. */
  setWatched(list: WatchedAction[]): void {
    const next = new Map(list.map((w) => [w.key, w]))
    for (const key of this.last.keys()) if (!next.has(key)) this.last.delete(key)
    this.watched = next
    this.schedule(0)
  }

  /** Read every watched instance of `actionId` now, e.g. right after it ran. */
  refresh(actionId: string): void {
    if ([...this.watched.values()].some((w) => w.actionId === actionId)) this.schedule(0)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(delay: number): void {
    if (this.stopped) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.watched.size === 0) return
    this.timer = setTimeout(() => void this.poll(), delay)
  }

  private async poll(): Promise<void> {
    this.timer = null
    if (this.polling) {
      // A refresh arrived mid-round. Run once more when this round ends.
      await this.polling
      this.schedule(0)
      return
    }
    this.polling = this.readAll()
    try {
      await this.polling
    } finally {
      this.polling = null
    }
    if (!this.timer) this.schedule(POLL_INTERVAL_MS)
  }

  private async readAll(): Promise<void> {
    const watched = [...this.watched.values()]
    const readings = await Promise.all(watched.map((w) => this.read(w)))
    const changed: ActionStateEntry[] = []
    watched.forEach((w, i) => {
      const value = readings[i] ?? null
      // Dropped from the watched set while this round was in flight.
      if (!this.watched.has(w.key)) return
      if (this.last.has(w.key) && this.last.get(w.key) === value) return
      this.last.set(w.key, value)
      changed.push({ key: w.key, nodeId: this.nodeId, value, updatedAt: Date.now() })
    })
    if (changed.length) this.report(changed)
  }

  private async read(w: WatchedAction): Promise<ActionStateValue> {
    const state = findActionState(actions[w.actionId]?.states, w.parameters)
    if (!state) return null
    try {
      return await state.get(w.parameters)
    } catch (err) {
      console.warn(`Failed to read state of ${w.actionId}`, err)
      return null
    }
  }
}
