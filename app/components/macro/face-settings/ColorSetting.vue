<template>
  <div class="color-row">
    <div class="form-group">
      <label>Foreground Color</label>
      <ColorInput v-model="foreground" />
    </div>
    <div class="form-group">
      <label>Background Color</label>
      <ColorInput v-model="background" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import ColorInput from '~/components/input/colorInput.vue'
import { colorFromHex, colorToHex } from '~/../shared/types'
import type { BaseFaceSettings, FaceSettingProps } from '~/composables/useMacroFace'

/** The `colors` face setting: the icon or text color, and the background. */
defineOptions({ inheritAttrs: false })
defineProps<FaceSettingProps>()
const base = defineModel<BaseFaceSettings>('base', { required: true })

const foreground = computed({
  get: () => colorToHex(base.value.iconColor),
  set: (hex) => (base.value = { ...base.value, iconColor: colorFromHex(hex) }),
})
const background = computed({
  get: () => colorToHex(base.value.backgroundColor),
  set: (hex) => (base.value = { ...base.value, backgroundColor: colorFromHex(hex) }),
})
</script>

<style scoped lang="postcss">
.color-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
}
</style>
