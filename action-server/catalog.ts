import type { ActionCatalog } from '../shared/types'
import { secretHint } from '../shared/types/node'
import { STANDARD_FACES, pluginActionId } from '../shared/types/plugin'
import type { PluginHost } from './plugin-host'

/** Catalogs cross the wire, so only include data. */
export function toCatalog(host: PluginHost): ActionCatalog {
  return {
    groups: host.groups().map((plugin) => ({
      id: plugin.manifest.id,
      label: plugin.manifest.label,
      version: plugin.manifest.version,
      builtin: !!plugin.builtin,
      ...(plugin.manifest.settings ? { settings: structuredClone(plugin.manifest.settings) } : {}),
      secretHints: Object.fromEntries(
        (plugin.manifest.settings ?? [])
          .filter((field) => field.secret)
          .map((field) => [field.key, secretHint(plugin.ctx.secrets[field.key])]),
      ),
      ...(plugin.manifest.icon ? { icon: plugin.manifest.icon } : {}),
      ...(plugin.module?.test ? { testable: true } : {}),
      availability: plugin.availability,
      actions: plugin.actions.map(({ action, availability }) => ({
        actionId: pluginActionId(plugin.manifest.id, action.id),
        label: action.label,
        actionFields: structuredClone(action.actionFields),
        availability,
        ...(action.group ? { group: action.group } : {}),
        ...(action.description ? { description: action.description } : {}),
        ...(action.icon ? { icon: action.icon } : {}),
        ...(action.face
          ? {
              face: (STANDARD_FACES as readonly string[]).includes(action.face)
                ? `core/${action.face}`
                : `${plugin.manifest.id}/${action.face}`,
            }
          : {}),
        ...(action.states
          ? {
              states: action.states.map(({ get: _get, subscribe: _subscribe, ...info }) => structuredClone(info)),
            }
          : {}),
      })),
    })),
  }
}
