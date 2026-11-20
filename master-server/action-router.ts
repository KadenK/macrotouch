import type { ActionStateValue } from '../shared/types/actionState'
import { randomUUID } from 'node:crypto'
import type { ActionResult, ListOptions, ProtocolError, RunAction, TestPlugin } from '../shared/protocol'
import type { Macro } from '../shared/types'
import { isRunnable } from '../shared/types/plugin'
import type { NodeRegistry, NodeSocket } from './node-registry'

type Pending = { client: NodeSocket; node: NodeSocket; requestId: string; timer: ReturnType<typeof setTimeout> }

export class ActionRouter {
  private pending = new Map<string, Pending>()

  constructor(private readonly nodes: NodeRegistry) {}

  trigger(macro: Macro, requestId: string, client: NodeSocket, value?: ActionStateValue): void {
    if (!macro.actionId) return

    const fail = (error: ProtocolError) => this.send(client, { type: 'action-result', requestId, ok: false, error })
    const node = macro.nodeId === undefined ? this.nodes.getLocal() : this.nodes.getById(macro.nodeId)
    if (!node) {
      fail({ code: 'node-offline', message: 'No action server is connected' })
      return
    }
    const group = node.catalog.groups.find((item) => item.actions.some((action) => action.actionId === macro.actionId))
    const action = group?.actions.find((item) => item.actionId === macro.actionId)
    if (!group || !action) {
      fail({ code: 'unknown-action', message: `Action ${macro.actionId} is not in the node catalog` })
      return
    }
    const availability = !isRunnable(group.availability) ? group.availability : action.availability
    if (availability && !isRunnable(availability) && !['not-ready', 'not-configured'].includes(availability.status)) {
      fail({
        code: availability.status === 'unsupported-platform' ? 'unsupported-platform' : 'action-unavailable',
        message: availability.message ?? 'Action is unavailable',
        details: availability,
      })
      return
    }

    if (!this.hasCapacity(client, node.socket, requestId)) return
    const routedId = randomUUID()
    const timer = setTimeout(() => this.pending.delete(routedId), 60_000)
    timer.unref()
    this.pending.set(routedId, { client, node: node.socket, requestId, timer })
    const message: RunAction = {
      type: 'run-action',
      requestId: routedId,
      actionId: macro.actionId,
      parameters: macro.parameters,
      ...(value === undefined ? {} : { value }),
    }
    node.socket.send(JSON.stringify(message))
  }

  /** Send an editor's request to the node it names (or the local one), and its `action-result` back. */
  forward(message: ListOptions | TestPlugin, client: NodeSocket): void {
    const node = message.nodeId === undefined ? this.nodes.getLocal() : this.nodes.getById(message.nodeId)
    if (!node) {
      this.send(client, {
        type: 'action-result',
        requestId: message.requestId,
        ok: false,
        error: { code: 'node-offline', message: 'Action server is offline' },
      })
      return
    }
    if (!this.hasCapacity(client, node.socket, message.requestId)) return
    const requestId = randomUUID()
    const timer = setTimeout(() => this.pending.delete(requestId), 60_000)
    timer.unref()
    this.pending.set(requestId, { client, node: node.socket, requestId: message.requestId, timer })
    node.socket.send(JSON.stringify({ ...message, requestId }))
  }

  result(node: NodeSocket, message: ActionResult): void {
    const pending = this.pending.get(message.requestId)
    if (!pending || pending.node !== node) return
    clearTimeout(pending.timer)
    this.pending.delete(message.requestId)
    this.send(pending.client, { ...message, requestId: pending.requestId })
  }

  disconnect(socket: NodeSocket): void {
    for (const [id, pending] of this.pending) {
      if (pending.client !== socket && pending.node !== socket) continue
      clearTimeout(pending.timer)
      this.pending.delete(id)
      if (pending.node === socket && pending.client !== socket)
        this.send(pending.client, {
          type: 'action-result',
          requestId: pending.requestId,
          ok: false,
          error: { code: 'node-offline', message: 'Action server disconnected' },
        })
    }
  }

  private hasCapacity(client: NodeSocket, node: NodeSocket, requestId: string): boolean {
    let clientCount = 0
    let nodeCount = 0
    for (const pending of this.pending.values()) {
      if (pending.client === client) clientCount++
      if (pending.node === node) nodeCount++
    }
    if (clientCount < 32 && nodeCount < 128) return true
    this.send(client, {
      type: 'action-result',
      requestId,
      ok: false,
      error: { code: 'action-failed', message: 'Too many requests in flight' },
    })
    return false
  }

  private send(socket: NodeSocket, message: ActionResult): void {
    if (socket.readyState === 1) socket.send(JSON.stringify(message))
  }
}
