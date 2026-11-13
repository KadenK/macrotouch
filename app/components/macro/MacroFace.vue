<template>
  <div class="macro-display" :style="{ backgroundColor: colorToHex(look.backgroundColor) }">
    <Icon
      :name="look.icon.source === 'LIBRARY' ? normalizeIconValue(look.icon.value) : ''"
      class="macro-icon"
      :style="{ color: colorToHex(look.iconColor) }"
    />
  </div>
  <!-- On the bottom edge, in the icon color so it reads on the background. -->
  <span v-if="label" class="macro-label" :style="{ color: colorToHex(look.iconColor) }">{{ label }}</span>
</template>

<script lang="ts" setup>
import { normalizeIconValue } from '~/composables/useIconData'
import { colorToHex } from '~/../shared/types'
import type { MacroLook } from '../../composables/useMacroKind'

/** One icon on a background, with an optional label: what a button-like macro draws. */
defineProps<{
  look: MacroLook
  /** Left out when labels are hidden. */
  label?: string
}>()
</script>

<style scoped lang="postcss">
.macro-display {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.macro-icon {
  width: 75%;
  height: 75%;
  min-width: 50px;
  aspect-ratio: 1/1;
  font-size: 28px;
}

.macro-label {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 0 0.5rem 0.4rem;
  font-size: 0.75rem;
  line-height: 1.2;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
