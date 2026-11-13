import type { ActionStateEntry, ActionStateKey, ActionStateValue, NodeId, WatchedAction } from '../shared/types'
import { findActionState } from '../shared/types/action'
import { actions } from './action-map'

const POLL_INTERVAL_MS = 1000
/**
 * Extra reads after an action runs, as gaps between them. Some effects land a
 * moment after the command returns — a media player takes a beat to report it
 * has paused — so one read straight away can still see the old value.
 */
const AFTER_RUN_READS_MS = [100, 200, 300, 400]

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
  /** Gaps still to wait between the quick reads that follow a run, before normal polling resumes. */
  private quickReads: number[] = []

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

  /**
   * Read every watched action now and a few times shortly after, e.g. right
   * after `actionId` ran, so its effect shows without waiting for the next poll.
   */
  refresh(actionId: string): void {
    if (![...this.watched.values()].some((w) => w.actionId === actionId)) return
    this.quickReads = [...AFTER_RUN_READS_MS]
    this.schedule(0)
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
    if (!this.timer) this.schedule(this.quickReads.shift() ?? POLL_INTERVAL_MS)
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
