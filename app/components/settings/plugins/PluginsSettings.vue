<template>
  <PluginInstaller />
  <SettingsGroup title="Plugins">
    <div v-for="plugin in entries" :key="plugin.id" class="plugin">
      <div class="heading">
        <Icon v-if="plugin.icon" :name="plugin.icon" />
        <strong>{{ plugin.label }}</strong>
        <span class="version">{{ plugin.version }}</span>
        <StatusChip v-if="plugin.builtin">Built-in</StatusChip>
        <StatusChip :tone="tone(status(plugin).kind)">{{ status(plugin).label }}</StatusChip>
        <div class="actions">
          <ToggleSwitch
            v-if="!plugin.builtin"
            :model-value="plugin.enabled"
            :aria-label="`Enable ${plugin.label}`"
            @update:model-value="store.updatePlugin(plugin.id, { enabled: $event })"
          />
          <button
            v-if="plugin.fields.length"
            type="button"
            :aria-expanded="expanded === plugin.id"
            @click="expanded = expanded === plugin.id ? '' : plugin.id"
          >
            Configure
          </button>
          <button v-if="!plugin.builtin" class="danger-btn" type="button" @click="remove(plugin.id)">Remove</button>
        </div>
      </div>
      <p v-for="line in status(plugin).details" :key="line" class="status">{{ line }}</p>
      <PluginConfigure
        v-if="expanded === plugin.id"
        :id="plugin.id"
        :fields="plugin.fields"
        :settings="plugin.settings"
        :builtin="plugin.builtin"
        :enabled="plugin.enabled"
      />
    </div>
  </SettingsGroup>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import SettingsGroup from '~/components/settings/SettingsGroup.vue'
import ToggleSwitch from '~/components/ui/ToggleSwitch.vue'
import StatusChip from '~/components/ui/StatusChip.vue'
import PluginConfigure from './PluginConfigure.vue'
import PluginInstaller from './PluginInstaller.vue'
import { useMacroStore } from '~/stores/macro'
import type { AvailabilityStatus } from '~/../shared/types/plugin'

const store = useMacroStore()
const expanded = ref('')
const entries = computed(() => {
  const builtins = store.actionGroups
    .filter((group) => group.builtin)
    .map((group) => ({
      id: group.id,
      label: group.label,
      icon: group.icon,
      version: group.version,
      builtin: true,
      enabled: true,
      fields: group.settings ?? [],
      settings: {} as Record<string, unknown>,
    }))
  return [
    ...builtins,
    ...Object.values(store.plugins).map((plugin) => ({
      ...plugin,
      builtin: false,
      fields: plugin.settingFields ?? [],
    })),
  ]
})
const statusLabels: Record<AvailabilityStatus, string> = {
  available: 'Ready',
  'not-ready': 'Not ready',
  'not-configured': 'Needs setup',
  'unsupported-platform': 'Not supported',
  'missing-dependency': 'Missing dependency',
  'plugin-error': 'Error',
}
const severity: Record<AvailabilityStatus, number> = {
  available: 0,
  'not-ready': 1,
  'not-configured': 2,
  'unsupported-platform': 3,
  'missing-dependency': 4,
  'plugin-error': 5,
}
function nodeStatus(id: string, nodeId: string, enabled: boolean) {
  const group = store.pluginGroup(nodeId, id)
  if (!group)
    return enabled
      ? { kind: 'not-ready', label: 'Installing', message: 'Not installed yet', hint: '' }
      : { kind: 'absent', label: 'Disabled', message: '', hint: '' }
  const unavailable = group.actions.filter(
    (action) => action.availability && action.availability.status !== 'available',
  )
  if (
    (group.availability?.status ?? 'available') === 'available' &&
    unavailable.length > 0 &&
    unavailable.length < group.actions.length
  ) {
    const needsSetup = unavailable.every((action) => action.availability?.status === 'not-configured')
    return {
      kind: 'available',
      label: 'Ready',
      message: `${unavailable.length} of ${group.actions.length} actions ${needsSetup ? 'need setup' : 'unavailable'}`,
      hint: '',
    }
  }
  const worst = [group.availability, ...unavailable.map((action) => action.availability)]
    .filter((item) => item && item.status !== 'available')
    .sort((a, b) => severity[b!.status] - severity[a!.status])[0]
  const kind = worst?.status ?? 'available'
  return { kind, label: statusLabels[kind], message: worst?.message ?? '', hint: worst?.hint ?? '' }
}
/**
 * One badge for the plugin: the worst status across action servers. Problems
 * are listed below it, naming the computer only when there is more than one.
 */
function status(plugin: { id: string; enabled: boolean }) {
  if (!plugin.enabled) return { kind: 'absent', label: 'Disabled', details: [] as string[] }
  const perNode = store.nodes.map((node) => ({ node, ...nodeStatus(plugin.id, node.nodeId, true) }))
  const rank = (kind: string) => (kind in severity ? severity[kind as AvailabilityStatus] : 1)
  const worst = [...perNode].sort((a, b) => rank(b.kind) - rank(a.kind))[0]
  const details = perNode
    .filter((item) => item.message)
    .map((item) => `${store.nodePrefix(item.node)}${item.message}${item.hint ? ` — ${item.hint}` : ''}`)
  return { kind: worst?.kind ?? 'not-ready', label: worst?.label ?? 'No action server', details }
}
function tone(kind: string) {
  if (kind === 'available') return 'success'
  if (kind === 'plugin-error') return 'danger'
  return kind in severity ? 'warning' : 'neutral'
}
function remove(id: string) {
  if (confirm('Remove this plugin from all action servers?')) store.deletePlugin(id)
}
</script>
<style scoped>
.plugin {
  border-top: var(--border-width) solid var(--color-border);
  padding: var(--space-4) 0;
}
.heading,
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.actions {
  margin-left: auto;
}
.version {
  color: var(--color-text-subtle);
  font-size: var(--text-sm);
}
.status {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-subtle);
}
button {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-text-strong);
  background: var(--color-surface);
  font-size: var(--text-sm);
  cursor: pointer;
}
button:hover {
  background: var(--color-hover);
}
button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.danger-btn {
  color: var(--color-danger);
  border-color: var(--color-danger);
}
.danger-btn:hover {
  background: color-mix(in srgb, var(--color-danger) 8%, var(--color-surface));
}
</style>
