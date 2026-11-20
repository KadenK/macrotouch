import type {
  ActionStateEntry,
  ActionStateKey,
  ActionStateValue,
  NodeId,
  WatchedAction,
  ActionAppearance,
} from '../shared/types'
import { findActionState } from '../shared/types/action'
import { redactSecrets } from './redact'
import type { PluginHost } from './plugin-host'
import { errorText } from '../shared/errors'
import { withTimeout } from './timeout'

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
  private subscriptions = new Map<ActionStateKey, () => void>()
  private watched = new Map<ActionStateKey, WatchedAction>()
  private last = new Map<ActionStateKey, ActionStateValue>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private polling: Promise<void> | null = null
  private stopped = false
  /** Gaps still to wait between the quick reads that follow a run, before normal polling resumes. */
  private quickReads: number[] = []

  constructor(
    private readonly host: PluginHost,
    private readonly nodeId: NodeId,
    private readonly report: (states: ActionStateEntry[]) => void,
  ) {}

  /** Replace the watched set. Newly watched actions are read straight away. */
  setWatched(list: WatchedAction[]): void {
    const next = new Map(list.map((w) => [w.key, w]))
    for (const key of this.last.keys())
      if (!next.has(key)) {
        this.last.delete(key)
        this.pushLast.delete(key)
      }
    for (const [key, unsubscribe] of this.subscriptions) {
      if (!next.has(key) || JSON.stringify(next.get(key)) !== JSON.stringify(this.watched.get(key))) {
        this.unsubscribe(unsubscribe)
        this.subscriptions.delete(key)
      }
    }
    this.watched = next
    for (const w of next.values()) {
      if (this.subscriptions.has(w.key)) continue
      const item = this.host.get(w.actionId)
      const state = findActionState(item?.action.states, w.parameters)
      if (state?.subscribe && item) {
        try {
          const unsubscribe = state.subscribe(
            w.parameters,
            (value, appearance) => this.emitReading(w, value, appearance),
            item.ctx,
          )
          this.subscriptions.set(w.key, unsubscribe)
          // A subscription only reports changes, so read the current value once.
          if (state.get)
            void this.read(w).then((value) => {
              if (this.subscriptions.has(w.key) && !this.pushLast.has(w.key)) this.emitReading(w, value)
            })
        } catch (error) {
          console.warn(`Failed to subscribe to ${w.actionId}`, redactSecrets(errorText(error), item.ctx.secrets))
        }
      }
    }
    this.schedule(0)
  }

  pluginReload(id: string, before: boolean): void {
    if (before) {
      for (const [key, watched] of this.watched)
        if (watched.actionId.startsWith(`${id}/`)) {
          const unsubscribe = this.subscriptions.get(key)
          if (unsubscribe) this.unsubscribe(unsubscribe)
          this.subscriptions.delete(key)
          this.last.delete(key)
          this.pushLast.delete(key)
        }
    } else this.setWatched([...this.watched.values()])
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
    for (const unsubscribe of this.subscriptions.values()) this.unsubscribe(unsubscribe)
    this.subscriptions.clear()
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private unsubscribe(unsubscribe: () => void): void {
    try {
      unsubscribe()
    } catch {
      console.warn('Failed to unsubscribe')
    }
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
    const watched = [...this.watched.values()].filter((w) => !this.subscriptions.has(w.key))
    const readings = await Promise.all(watched.map((w) => this.read(w)))
    const changed: ActionStateEntry[] = []
    watched.forEach((w, i) => {
      const value = readings[i] ?? null
      // Dropped from the watched set while this round was in flight.
      if (!this.watched.has(w.key)) return
      if (this.last.has(w.key) && this.last.get(w.key) === value) return
      this.last.set(w.key, value)
      changed.push({
        key: w.key,
        nodeId: this.nodeId,
        value,
        updatedAt: Date.now(),
      })
    })
    if (changed.length) this.report(changed)
  }

  private emitReading(w: WatchedAction, value: ActionStateValue, appearance?: ActionAppearance): void {
    if (!this.watched.has(w.key)) return
    const signature = JSON.stringify([value, appearance])
    if (this.pushLast.get(w.key) === signature) return
    this.pushLast.set(w.key, signature)
    this.last.set(w.key, value)
    this.report([
      {
        key: w.key,
        nodeId: this.nodeId,
        value,
        ...(appearance ? { appearance } : {}),
        updatedAt: Date.now(),
      },
    ])
  }

  private failures = new Map<ActionStateKey, number>()
  private pushLast = new Map<ActionStateKey, string>()

  private async read(w: WatchedAction): Promise<ActionStateValue> {
    const item = this.host.get(w.actionId)
    const state = findActionState(item?.action.states, w.parameters)
    if (!state?.get || !item) return null
    try {
      return await withTimeout(() => state.get!(w.parameters, item.ctx), 5000, 'State getter timed out')
    } catch (err) {
      if (Date.now() - (this.failures.get(w.key) ?? 0) >= 60000) {
        this.failures.set(w.key, Date.now())
        console.warn(`Failed to read state of ${w.actionId}`, redactSecrets(errorText(err), item.ctx.secrets))
      }
      return null
    }
  }
}
