import type { Macro } from '../shared/types'
import { actions } from './action-map'

export function handleMacroTrigger(macro: Macro) {
  if (macro && macro.actionId) {
    try {
      const action = actions[macro.actionId]
      if (!action) {
        console.warn(`No action found for actionId: ${macro.actionId}`)
        return
      }
      action.execute(macro.parameters)
    } catch (err) {
      console.error('Failed to execute macro action', err)
    }
  }
}
