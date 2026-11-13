<template>
  <div class="macro-kind" @click="mode === 'interact' && emit('trigger')">
    <MacroFace :look="macro" :label="showLabel ? macro.name : undefined" />
  </div>
</template>

<script lang="ts" setup>
import MacroFace from '../MacroFace.vue'
import type { MacroDisplayEmits, MacroDisplayProps } from '../../../composables/useMacroKind'

/** A plain button: the macro's own icon and colors, and a tap runs it. */
defineProps<MacroDisplayProps>()
const emit = defineEmits<MacroDisplayEmits>()
</script>

<style scoped lang="postcss">
.macro-kind {
  width: 100%;
  height: 100%;
}
</style>
