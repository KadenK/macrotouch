<template>
  <div class="form-group">
    <label>Icon</label>
    <IconInput v-model="icon" :icon-color="iconColorHex" :background-color="bgColorHex" with-button />
  </div>

  <div class="color-row">
    <div class="form-group">
      <label>Icon Color</label>
      <ColorInput v-model="iconColorHex" />
    </div>
    <div class="form-group">
      <label>Background Color</label>
      <ColorInput v-model="bgColorHex" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import ColorInput from '~/components/input/colorInput.vue'
import { colorFromHex, colorToHex } from '~/../shared/types'
import IconInput from '~/components/input/iconInput.vue'
import type { MacroLook, MacroSettingsProps, StateAppearance } from '../../../composables/useMacroKind'

/** Settings for a plain button: one icon, two colors. */
defineProps<MacroSettingsProps>()

const look = defineModel<MacroLook>('look', { required: true })
const stateAppearance = defineModel<StateAppearance | undefined>('stateAppearance')

const icon = computed({
  get: () => look.value.icon,
  set: (value) => (look.value = { ...look.value, icon: value }),
})
const iconColorHex = computed({
  get: () => colorToHex(look.value.iconColor),
  set: (hex) => (look.value = { ...look.value, iconColor: colorFromHex(hex) }),
})
const bgColorHex = computed({
  get: () => colorToHex(look.value.backgroundColor),
  set: (hex) => (look.value = { ...look.value, backgroundColor: colorFromHex(hex) }),
})

// A stateless macro has no per-value look.
onMounted(() => {
  stateAppearance.value = undefined
})
</script>

<style scoped lang="postcss">
.color-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
}
</style>
