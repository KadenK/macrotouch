<template>
  <div
    class="icon-face"
    :style="{ backgroundColor: colorToHex(current.backgroundColor) }"
    @click="mode === 'interact' && emit('trigger')"
  >
    <img
      v-if="imageSrc"
      :src="imageSrc"
      :class="['image', `image--${current.icon.image?.mode ?? 'inset'}`]"
      draggable="false"
      alt=""
    />
    <Icon
      v-else
      :name="current.icon.source === 'LIBRARY' ? normalizeIconValue(current.icon.value) : ''"
      class="icon"
      :style="{ color: colorToHex(current.iconColor) }"
    />
    <FaceLabel
      v-if="showLabel"
      :name="macro.name"
      :class="{ 'label-on-image': current.icon.image?.mode === 'fill' && imageSrc }"
      :style="{ color: colorToHex(current.iconColor) }"
    />
  </div>
</template>

<script lang="ts" setup>
import FaceLabel from './FaceLabel.vue'
import { macroImageSrc } from '~/composables/useMacroImage'
import { normalizeIconValue } from '~/composables/useIconData'
import { colorToHex } from '~/../shared/types'
import type { BaseFaceSettings, MacroDisplayEmits, MacroDisplayProps } from '~/composables/useMacroFace'

/**
 * The standard face: the macro's icon on its background, and a tap runs it.
 * For a toggle action (such as mute) the icon and colors follow the live value
 * through `stateAppearance`, with anything the action reports for itself on top.
 */
const props = defineProps<MacroDisplayProps>()
const emit = defineEmits<MacroDisplayEmits>()

const current = computed<BaseFaceSettings>(() => {
  const { macro, mode, entry } = props
  const base: BaseFaceSettings = {
    icon: macro.icon,
    iconColor: macro.iconColor,
    backgroundColor: macro.backgroundColor,
  }
  // The editor, and a remote that has no reading yet, show the "off" state.
  const value = mode === 'interact' && entry && entry.value !== null ? String(entry.value) : 'false'
  return {
    ...base,
    ...macro.stateAppearance?.[value],
    ...(mode === 'interact' ? entry?.appearance : undefined),
  }
})

const imageSrc = computed(() => macroImageSrc(current.value.icon))
</script>

<style scoped lang="postcss">
.icon-face {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
}

.icon {
  width: 75%;
  height: 75%;
  min-width: 50px;
  aspect-ratio: 1/1;
  font-size: 28px;
}

/* Never a drag source or text-like selection: the face is a button. */
.image {
  user-select: none;
  pointer-events: none;
  -webkit-user-drag: none;
}

.image--inset {
  width: 75%;
  height: 75%;
  object-fit: contain;
  /* The same corner radius as the macro. */
  border-radius: 8px;
}

.image--fill {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Over a fill image the icon color may not read, so back it with a shadow. */
.label-on-image {
  text-shadow:
    0 0 3px rgb(0 0 0 / 0.85),
    0 1px 2px rgb(0 0 0 / 0.7);
}
</style>
