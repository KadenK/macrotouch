<template>
  <div
    class="value-face"
    :style="{ backgroundColor: colorToHex(colors.backgroundColor), color: colorToHex(colors.iconColor) }"
    @click="mode === 'interact' && emit('trigger')"
  >
    <span class="value" :style="{ fontSize }">{{ text }}</span>
    <FaceLabel v-if="showLabel" :name="macro.name" />
  </div>
</template>

<script lang="ts" setup>
import FaceLabel from './FaceLabel.vue'
import { colorToHex } from '~/../shared/types'
import { textFaceSetting, type MacroDisplayEmits, type MacroDisplayProps } from '~/composables/useMacroFace'

/**
 * The live value itself, filling the cell: a counter, a clock, a sensor
 * reading. A tap runs the macro. The editor shows a dash in place of the value.
 */
const props = defineProps<MacroDisplayProps>()
const emit = defineEmits<MacroDisplayEmits>()

const settings = computed(() => textFaceSetting(props.macro))
const colors = computed(() => ({
  iconColor: props.macro.iconColor,
  backgroundColor: props.macro.backgroundColor,
  ...(props.mode === 'interact' ? props.entry?.appearance : undefined),
}))
const text = computed(() => {
  const value = props.mode === 'interact' ? props.entry?.value : undefined
  return `${settings.value.prefix}${value === undefined || value === null ? '–' : String(value)}${settings.value.suffix}`
})
/** `auto` shrinks longer text so it still fits on one line. */
const fontSize = computed(() => {
  const fixed = { small: '18cqmin', medium: '30cqmin', large: '45cqmin' } as const
  if (settings.value.size !== 'auto') return fixed[settings.value.size]
  return `min(45cqh, ${Math.round(170 / Math.max(text.value.length, 1))}cqw)`
})
</script>

<style scoped lang="postcss">
.value-face {
  position: relative;
  container-type: size;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
}

.value {
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
