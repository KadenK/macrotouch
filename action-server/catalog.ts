import type { ActionCatalog, ActionDescriptor } from '../shared/types'
import actions from './actions/index'

/** Everything this action server can run. `execute` stays behind: a catalog is data. */
export function toCatalog(): ActionCatalog {
  const descriptors: ActionDescriptor[] = actions.map((action) => ({
    actionId: action.actionId,
    label: action.label,
    actionFields: action.actionFields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      ...(field.options ? { options: [...field.options] } : {}),
    })),
  }))
  return { groups: [{ id: 'builtin', label: 'Built-in', actions: descriptors }] }
}
