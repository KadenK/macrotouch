<template>
  <div class="configure">
    <p v-if="builtin" class="status">Built-in settings can't be changed yet.</p>
    <p v-else-if="!enabled" class="status">Enable the plugin to change its settings.</p>
    <section v-if="plainFields.length" class="group">
      <h3>Settings</h3>
      <SettingRow v-for="field in plainFields" :key="field.key" :label="field.label">
        <ToggleSwitch
          v-if="field.type === 'boolean'"
          :model-value="!!settings[field.key]"
          :disabled="locked"
          :aria-label="field.label"
          @update:model-value="save(field.key, $event)"
        />
        <select
          v-else-if="field.type === 'enum'"
          :value="settings[field.key] ?? ''"
          :disabled="locked"
          :aria-label="field.label"
          @change="save(field.key, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
        </select>
        <!-- Saved when the field loses focus or Enter is pressed, so typing doesn't restart the plugin on every key. -->
        <input
          v-else
          :value="settings[field.key] ?? ''"
          :type="field.type === 'number' ? 'number' : 'text'"
          :disabled="locked"
          :aria-label="field.label"
          @change="saveText(field, ($event.target as HTMLInputElement).value)"
        />
      </SettingRow>
    </section>
    <section v-if="secretFields.length" class="group secrets">
      <h3>Secrets</h3>
      <SettingRow v-for="field in secretFields" :key="field.key" :label="field.label">
        <SecretField
          :label="field.label"
          :hints="hints(field.key)"
          :disabled="locked"
          @save="store.setPluginSecrets(id, 'all', { [field.key]: $event })"
        />
      </SettingRow>
    </section>
    <div v-if="testable" class="test">
      <button type="button" :disabled="locked || testing" @click="runTest">
        {{ testing ? 'Testing…' : 'Test connection' }}
      </button>
      <p v-for="result in testResults" :key="result.text" class="test-result" :class="{ ok: result.ok }" role="status">
        {{ result.text }}
      </p>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import ToggleSwitch from '~/components/ui/ToggleSwitch.vue'
import SecretField from './SecretField.vue'
import { useMacroStore } from '~/stores/macro'
import { errorText } from '~/../shared/errors'
import type { PluginSettingField } from '~/../shared/types/plugin'

/**
 * A plugin's settings, saved as they change like the rest of the settings
 * pages. Secrets are sent to every action server and stored only there.
 */
const props = defineProps<{
  id: string
  fields: PluginSettingField[]
  settings: Record<string, unknown>
  builtin: boolean
  enabled: boolean
}>()
const store = useMacroStore()
/** Built-in plugins can't be configured yet, and a disabled one isn't running anywhere to take changes. */
const locked = computed(() => props.builtin || !props.enabled)
const plainFields = computed(() => props.fields.filter((field) => !field.secret))
const secretFields = computed(() => props.fields.filter((field) => field.secret))

function save(key: string, value: unknown) {
  store.updatePlugin(props.id, { settings: { [key]: value } })
}
function saveText(field: PluginSettingField, value: string) {
  save(field.key, field.type === 'number' ? Number(value) : value)
}

/** What each connected action server says about its saved value of a secret. */
function hints(key: string) {
  return store.nodes.map((node) => store.pluginGroup(node.nodeId, props.id)?.secretHints?.[key] ?? null)
}
/** Action servers whose copy of the plugin has a connection test. */
const testNodes = computed(() => store.nodes.filter((node) => store.pluginGroup(node.nodeId, props.id)?.testable))
const testable = computed(() => testNodes.value.length > 0)
const testing = ref(false)
const testResults = ref<{ ok: boolean; text: string }[]>([])
/** Test on every action server at once; name each one only when there are several. */
async function runTest() {
  testing.value = true
  testResults.value = []
  testResults.value = await Promise.all(
    testNodes.value.map(async (node) => {
      const where = store.nodePrefix(node)
      try {
        const result = await store.testPlugin(node.nodeId, props.id)
        return { ok: result.ok, text: where + result.message }
      } catch (error) {
        return { ok: false, text: where + errorText(error) }
      }
    }),
  )
  testing.value = false
}
</script>
<style scoped>
.configure {
  margin-top: var(--space-3);
  color: var(--color-text-strong);
}
.status {
  margin: 0 0 var(--space-2);
  color: var(--color-text-subtle);
  font-size: var(--text-sm);
}
.group + .group {
  margin-top: var(--space-3);
}
.group h3 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-sm);
}
/* Each section's rows sit under its heading, indented with a guide line. */
.group > :not(h3) {
  margin-left: var(--space-2);
  padding-left: var(--space-3);
  border-left: 2px solid var(--color-border);
}
.test {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-top: var(--space-3);
}
.test-result {
  margin: var(--space-2) 0 0;
  text-align: right;
  font-size: var(--text-sm);
  color: var(--color-danger);
}
.test-result.ok {
  color: var(--color-primary);
}
input,
select,
button {
  min-width: 0;
  color: var(--color-text-strong);
  background: var(--color-input-bg);
  border: var(--border-width) solid var(--color-input-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  font-size: var(--text-sm);
}
button {
  cursor: pointer;
}
button:disabled,
input:disabled,
select:disabled {
  cursor: not-allowed;
}
input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
