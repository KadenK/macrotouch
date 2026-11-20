import type { NodeHello } from '../shared/protocol'
import type { ActionCatalog, NodeId, NodeInfo } from '../shared/types/node'
import { isSelectable } from '../shared/types/plugin'
import { findActionState } from '../shared/types/action'

export type NodeSocket = {
  readyState: number
  send(data: string): void
}

type Entry = { info: NodeInfo; catalog: ActionCatalog }

export class NodeRegistry {
  private nodes = new Map<NodeSocket, Entry>()
  private listeners: Array<() => void> = []

  /** Called after a node registers or is removed. */
  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  register(socket: NodeSocket, hello: NodeHello): void {
    this.nodes.set(socket, {
      info: {
        nodeId: this.nodes.get(socket)?.info.nodeId ?? hello.nodeId,
        label: hello.label,
        platform: hello.platform,
        local: hello.local === true,
      },
      catalog: hello.catalog,
    })
    this.notify()
  }

  remove(socket: NodeSocket): void {
    if (this.nodes.delete(socket)) this.notify()
  }

  getLocal(): { socket: NodeSocket; info: NodeInfo; catalog: ActionCatalog } | undefined {
    for (const [socket, { info, catalog }] of this.nodes) {
      if (socket.readyState === 1 && info.local) return { socket, info, catalog }
    }
    return undefined
  }

  getById(id: string): { socket: NodeSocket; info: NodeInfo; catalog: ActionCatalog } | undefined {
    for (const [socket, { info, catalog }] of this.nodes) {
      if (socket.readyState === 1 && info.nodeId === id) return { socket, info, catalog }
    }
    return undefined
  }

  infos(): NodeInfo[] {
    return [...this.nodes.values()].map(({ info }) => info)
  }

  /** True while any node is registered. */
  hasAny(): boolean {
    return this.nodes.size > 0
  }

  sockets(): NodeSocket[] {
    return [...this.nodes.keys()]
  }

  /** The first connected node that can report state for `actionId` run with `parameters`. */
  findStateful(actionId: string, parameters?: Record<string, unknown>, nodeId?: string): NodeSocket | undefined {
    const target = nodeId === undefined ? this.getLocal() : this.getById(nodeId)
    for (const [socket, { catalog }] of this.nodes) {
      if (socket !== target?.socket || socket.readyState !== 1) continue
      const found = catalog.groups.some(
        (group) =>
          isSelectable(group.availability) &&
          group.actions.some(
            (action) =>
              isSelectable(action.availability) &&
              action.actionId === actionId &&
              !!findActionState(action.states, parameters),
          ),
      )
      if (found) return socket
    }
    return undefined
  }

  /** One catalog per connected node. */
  catalogs(): Record<NodeId, ActionCatalog> {
    const catalogs: Record<NodeId, ActionCatalog> = {}
    for (const { info, catalog } of this.nodes.values()) catalogs[info.nodeId] = catalog
    return catalogs
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
