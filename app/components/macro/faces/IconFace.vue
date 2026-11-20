<template>
  <div class="macro-kind" @click="mode === 'interact' && emit('trigger')">
    <MacroFace :look="look" :label="showLabel ? macro.name : undefined" />
  </div>
</template>

<script lang="ts" setup>
import MacroFace from '../MacroFace.vue'
import type { MacroDisplayEmits, MacroDisplayProps, MacroLook } from '../../../composables/useMacroKind'

/**
 * A button for an on/off state, such as mute. A tap runs the macro; the look
 * follows the live value through `stateAppearance`, with anything the action
 * reports for itself on top.
 */
const props = defineProps<MacroDisplayProps>()
const emit = defineEmits<MacroDisplayEmits>()

const look = computed<MacroLook>(() => {
  const { macro, mode, entry } = props
  const base: MacroLook = { icon: macro.icon, iconColor: macro.iconColor, backgroundColor: macro.backgroundColor }
  // The editor, and a remote that has no reading yet, show the "off" look.
  const value = mode === 'interact' && entry && entry.value !== null ? String(entry.value) : 'false'
  return {
    ...base,
    ...macro.stateAppearance?.[value],
    ...(mode === 'interact' ? entry?.appearance : undefined),
  }
})
</script>

<style scoped lang="postcss">
.macro-kind {
  width: 100%;
  height: 100%;
}
</style>
