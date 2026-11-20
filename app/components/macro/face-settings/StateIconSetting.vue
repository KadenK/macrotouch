<template>
  <!-- First so switching it never moves it. -->
  <label class="advanced-row">
    <ToggleSwitch v-model="advanced" />
    <span>Advanced</span>
  </label>

  <!-- Off: the action's icons in the macro's own colors, so only the colors are offered. -->
  <div v-if="!advanced" class="color-row">
    <div class="form-group">
      <label>Icon Color</label>
      <ColorInput v-model="iconColorHex" />
    </div>
    <div class="form-group">
      <label>Background Color</label>
      <ColorInput v-model="bgColorHex" />
    </div>
  </div>

  <!-- On: each value's icon and colors, in place of the general colors. -->
  <template v-else>
    <div v-for="value in VALUES" :key="value" class="state-group">
      <div class="state-heading-row">
        <span class="state-heading">When {{ valueLabel(value) }}</span>
        <button v-if="overrides[value]" type="button" class="link-btn" @click="overrides[value] = undefined">
          Reset
        </button>
      </div>
      <div class="state-row">
        <IconInput
          :model-value="looks[value].icon"
          :icon-color="looks[value].iconColorHex"
          :background-color="looks[value].bgColorHex"
          @update:model-value="setOverride(value, 'icon', $event)"
        />
        <div class="form-group">
          <label>Icon Color</label>
          <ColorInput
            :model-value="looks[value].iconColorHex"
            @update:model-value="setOverride(value, 'iconColorHex', $event)"
          />
        </div>
        <div class="form-group">
          <label>Background Color</label>
          <ColorInput
            :model-value="looks[value].bgColorHex"
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
import type { MacroLook, MacroSettingsProps, StateAppearance } from '../../../composables/useMacroKind'

/**
 * Settings for a toggle macro, such as mute.
 *
 * By default the macro shows the action's icon for each value in its own
 * colors. Advanced replaces the general colors with an icon and colors per
 * value, kept as overrides so anything left alone still follows the default.
 */
const props = defineProps<MacroSettingsProps>()

const look = defineModel<MacroLook>('look', { required: true })
const stateAppearance = defineModel<StateAppearance | undefined>('stateAppearance')

const VALUES = ['true', 'false'] as const
type ToggleValue = (typeof VALUES)[number]
type StateOverride = { icon?: Icon; iconColorHex?: string; bgColorHex?: string }
type StateLook = { icon: Icon; iconColorHex: string; bgColorHex: string }

function valueLabel(value: ToggleValue): string {
  return props.state?.valueLabels?.[value] ?? (value === 'true' ? 'on' : 'off')
}

const iconColorHex = computed({
  get: () => colorToHex(look.value.iconColor),
  set: (hex) => (look.value = { ...look.value, iconColor: colorFromHex(hex) }),
})
const bgColorHex = computed({
  get: () => colorToHex(look.value.backgroundColor),
  set: (hex) => (look.value = { ...look.value, backgroundColor: colorFromHex(hex) }),
})

/** For an action that names no icons: the macro's icon as it was when the editor opened. */
const fallbackIcon = look.value.icon

function defaultLook(value: ToggleValue): StateLook {
  const icon = props.state?.defaultIcons?.[value]
  return {
    icon: icon ? { source: IconSource.Library, value: icon } : fallbackIcon,
    iconColorHex: iconColorHex.value,
    bgColorHex: bgColorHex.value,
  }
}

/** Overrides survive switching Advanced off, but only count while it is on. */
const overrides = ref<Partial<Record<ToggleValue, StateOverride>>>({})
const advanced = ref(false)

const looks = computed(() => {
  const result = {} as Record<ToggleValue, StateLook>
  for (const value of VALUES) {
    result[value] = { ...defaultLook(value), ...(advanced.value ? overrides.value[value] : {}) }
  }
  return result
})

/** Record a change, or drop it when it is back to the default. */
function setOverride<K extends keyof StateOverride>(value: ToggleValue, field: K, next: StateOverride[K]) {
  const fallback = defaultLook(value)[field]
  const same = field === 'icon' ? (next as Icon).value === (fallback as Icon).value : next === fallback
  const merged: StateOverride = { ...overrides.value[value], [field]: same ? undefined : next }
  const current = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)) as StateOverride
  overrides.value[value] = Object.keys(current).length ? current : undefined
}

// Read back what Advanced changed last time: anything that differs from the default.
for (const value of VALUES) {
  const saved = stateAppearance.value?.[value]
  if (saved?.icon) setOverride(value, 'icon', { ...saved.icon })
  if (saved?.iconColor) setOverride(value, 'iconColorHex', colorToHex(saved.iconColor))
  if (saved?.backgroundColor) setOverride(value, 'bgColorHex', colorToHex(saved.backgroundColor))
}
advanced.value = Object.values(overrides.value).some(Boolean)

/**
 * Write the result back. Icons always go in, so the remote needs no catalog;
 * colors only where Advanced set them, so the rest follow the macro's own.
 * The macro's own icon becomes the "off" one, shown while the value is unknown.
 */
watch(
  [advanced, overrides, () => look.value.iconColor, () => look.value.backgroundColor, () => props.state],
  () => {
    const result: Record<string, ActionAppearance> = {}
    for (const value of VALUES) {
      const override = advanced.value ? overrides.value[value] : undefined
      result[value] = {
        icon: looks.value[value].icon,
        ...(override?.iconColorHex ? { iconColor: colorFromHex(override.iconColorHex) } : {}),
        ...(override?.bgColorHex ? { backgroundColor: colorFromHex(override.bgColorHex) } : {}),
      }
    }
    stateAppearance.value = result
    const offIcon = looks.value.false.icon
    if (look.value.icon.value !== offIcon.value) look.value = { ...look.value, icon: offIcon }
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

.color-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
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
