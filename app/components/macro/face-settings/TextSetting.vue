<template>
  <div class="form-group">
    <label for="face-text-size">Text Size</label>
    <select id="face-text-size" v-model="text.size" class="text-input">
      <option value="auto">Fit to cell</option>
      <option value="small">Small</option>
      <option value="medium">Medium</option>
      <option value="large">Large</option>
    </select>
  </div>
  <div class="affix-row">
    <div class="form-group">
      <label for="face-text-prefix">Before Value</label>
      <input id="face-text-prefix" v-model="text.prefix" class="text-input" placeholder="e.g. $" />
    </div>
    <div class="form-group">
      <label for="face-text-suffix">After Value</label>
      <input id="face-text-suffix" v-model="text.suffix" class="text-input" placeholder="e.g. °C" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { textFaceSetting, type FaceSettingProps } from '~/composables/useMacroFace'

/** The `text` face setting: how the value face shows the value. Saved as `faceSettings.text`. */
defineOptions({ inheritAttrs: false })
const props = defineProps<FaceSettingProps>()
const faceSettings = defineModel<Record<string, unknown> | undefined>('faceSettings')

const text = reactive(textFaceSetting(props.macro))
watch(text, () => (faceSettings.value = { ...faceSettings.value, text: { ...text } }), { deep: true })
</script>

<style scoped lang="postcss">
.affix-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
}
</style>
