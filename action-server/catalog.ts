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
    ...(action.states
      ? {
          // Only the data; `get` stays behind.
          states: action.states.map(({ get: _get, ...info }) => structuredClone(info)),
        }
      : {}),
  }))
  return { groups: [{ id: 'builtin', label: 'Built-in', actions: descriptors }] }
}
