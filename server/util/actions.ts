import type { Action } from '../../types/action'
import actionClasses from '../../util/actions/index'

export type ActionsMap = Record<string, Action>
export const actions: ActionsMap = {}

for (const action of actionClasses) {
  if (action?.actionId) {
    actions[action.actionId] = action
  }
}

export function getActionById(id: string): Action | undefined {
  return actions[id]
}

export function executeAction(id: string, parameters?: Record<string, unknown>): unknown {
  const action = getActionById(id)
  if (!action) {
    throw new Error(`Unknown actionId: ${id}`)
  }
  return action.execute?.(parameters)
}
