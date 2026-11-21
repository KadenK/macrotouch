<template>
  <!-- First so switching it never moves it. -->
  <label class="advanced-row">
    <ToggleSwitch v-model="advanced" />
    <span>Customize each state</span>
  </label>

  <!-- On: each value's icon and colors, over the macro's own colors. Off: the action's icons in those colors. -->
  <template v-if="advanced">
    <div v-for="value in VALUES" :key="value" class="state-group">
      <div class="state-heading-row">
        <span class="state-heading">When {{ valueLabel(value) }}</span>
        <button v-if="overrides[value]" type="button" class="link-btn" @click="overrides[value] = undefined">
          Reset
        </button>
      </div>
      <div class="state-row">
        <IconInput
          :model-value="perState[value].icon"
          :icon-color="perState[value].iconColorHex"
          :background-color="perState[value].bgColorHex"
          @update:model-value="setOverride(value, 'icon', $event)"
        />
        <div class="form-group">
          <label>Icon Color</label>
          <ColorInput
            :model-value="perState[value].iconColorHex"
            @update:model-value="setOverride(value, 'iconColorHex', $event)"
          />
        </div>
        <div class="form-group">
          <label>Background Color</label>
          <ColorInput
            :model-value="perState[value].bgColorHex"
            @update:model-value="setOverride(value, 'bgColorHex', $event)"
          />
        </div>
      </div>
    </div>
  </template>
</template>

<script lang="ts" setup>
import ColorInput from '~/components/input/colorInput.vue'
import ToggleSwitch from '~/components/ui/ToggleSwitch.vue'
import type { ActionAppearance, Icon } from '~/../shared/types'
import { colorFromHex, colorToHex } from '~/../shared/types'
import { IconSource } from '~/../shared/types/macro'
import IconInput from '~/components/input/iconInput.vue'
import type { BaseFaceSettings, FaceSettingProps, StateAppearance } from '~/composables/useMacroFace'

/**
 * The `stateIcons` face setting, for a toggle action such as mute.
 *
 * By default the macro shows the action's icon for each value in the macro's
 * own colors. "Customize each state" sets an icon and colors per value, kept as
 * overrides so anything left alone still follows the default.
 */
defineOptions({ inheritAttrs: false })
const props = defineProps<FaceSettingProps>()

const base = defineModel<BaseFaceSettings>('base', { required: true })
const stateAppearance = defineModel<StateAppearance | undefined>('stateAppearance')

const VALUES = ['true', 'false'] as const
type ToggleValue = (typeof VALUES)[number]
type StateOverride = { icon?: Icon; iconColorHex?: string; bgColorHex?: string }
type StateSettings = { icon: Icon; iconColorHex: string; bgColorHex: string }

function valueLabel(value: ToggleValue): string {
  return props.state?.valueLabels?.[value] ?? (value === 'true' ? 'on' : 'off')
}

const iconColorHex = computed(() => colorToHex(base.value.iconColor))
const bgColorHex = computed(() => colorToHex(base.value.backgroundColor))

/** For an action that names no icons: the macro's icon as it was when the editor opened. */
const fallbackIcon = base.value.icon

function defaultFor(value: ToggleValue): StateSettings {
  const icon = props.state?.defaultIcons?.[value]
  return {
    icon: icon ? { source: IconSource.Library, value: icon } : fallbackIcon,
    iconColorHex: iconColorHex.value,
    bgColorHex: bgColorHex.value,
  }
}

/** Overrides survive switching customization off, but only count while it is on. */
const overrides = ref<Partial<Record<ToggleValue, StateOverride>>>({})
const advanced = ref(false)

const perState = computed(() => {
  const result = {} as Record<ToggleValue, StateSettings>
  for (const value of VALUES) {
    result[value] = { ...defaultFor(value), ...(advanced.value ? overrides.value[value] : {}) }
  }
  return result
})

/** Record a change, or drop it when it is back to the default. */
function setOverride<K extends keyof StateOverride>(value: ToggleValue, field: K, next: StateOverride[K]) {
  const fallback = defaultFor(value)[field]
  const same = field === 'icon' ? (next as Icon).value === (fallback as Icon).value : next === fallback
  const merged: StateOverride = { ...overrides.value[value], [field]: same ? undefined : next }
  const current = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)) as StateOverride
  overrides.value[value] = Object.keys(current).length ? current : undefined
}

// Read back what was customized last time: anything that differs from the default.
for (const value of VALUES) {
  const saved = stateAppearance.value?.[value]
  if (saved?.icon) setOverride(value, 'icon', { ...saved.icon })
  if (saved?.iconColor) setOverride(value, 'iconColorHex', colorToHex(saved.iconColor))
  if (saved?.backgroundColor) setOverride(value, 'bgColorHex', colorToHex(saved.backgroundColor))
}
advanced.value = Object.values(overrides.value).some(Boolean)

/**
 * Write the result back. Icons always go in, so the remote needs no catalog;
 * colors only where customized, so the rest follow the macro's own.
 * The macro's own icon becomes the "off" one, shown while the value is unknown.
 */
watch(
  [advanced, overrides, () => base.value.iconColor, () => base.value.backgroundColor, () => props.state],
  () => {
    const result: Record<string, ActionAppearance> = {}
    for (const value of VALUES) {
      const override = advanced.value ? overrides.value[value] : undefined
      result[value] = {
        icon: perState.value[value].icon,
        ...(override?.iconColorHex ? { iconColor: colorFromHex(override.iconColorHex) } : {}),
        ...(override?.bgColorHex ? { backgroundColor: colorFromHex(override.bgColorHex) } : {}),
      }
    }
    stateAppearance.value = result
    const offIcon = perState.value.false.icon
    if (base.value.icon.value !== offIcon.value) base.value = { ...base.value, icon: offIcon }
  },
  { deep: true, immediate: true },
)
</script>

<style scoped lang="postcss">
.advanced-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.state-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.state-heading-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.state-heading {
  font-weight: 600;
}

.link-btn {
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-faint);
  font-size: 0.75rem;
  text-decoration: underline;
  cursor: pointer;
}

.state-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem 1.5rem;
}
</style>
