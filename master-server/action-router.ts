import type { RunAction } from '../shared/protocol'
import type { Macro } from '../shared/types'
import { uuid } from '../shared/uuid'
import type { NodeRegistry } from './node-registry'

export class ActionRouter {
  constructor(private readonly nodes: NodeRegistry) {}

  /** All macros currently use the first connected local node. */
  private nodeForMacro(_macro: Macro) {
    return this.nodes.getLocal()
  }

  trigger(macro: Macro): void {
    if (!macro.actionId) return

    const node = this.nodeForMacro(macro)
    if (!node) {
      console.warn(`No action server connected, dropping trigger for macro ${macro.id}`)
      return
    }

    const message: RunAction = {
      type: 'run-action',
      requestId: uuid(),
      actionId: macro.actionId,
      parameters: macro.parameters,
    }
    node.socket.send(JSON.stringify(message))
  }
}
