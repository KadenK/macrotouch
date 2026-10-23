import type { NodeHello } from '../shared/protocol'
import type { ActionCatalog, NodeId, NodeInfo } from '../shared/types/node'

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
      info: { nodeId: hello.nodeId, label: hello.label, platform: hello.platform, local: true },
      catalog: hello.catalog,
    })
    this.notify()
  }

  remove(socket: NodeSocket): void {
    if (this.nodes.delete(socket)) this.notify()
  }

  getLocal(): { socket: NodeSocket; info: NodeInfo } | undefined {
    for (const [socket, { info }] of this.nodes) {
      if (socket.readyState === 1) return { socket, info }
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
