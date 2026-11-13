<template>
  <Popover v-model:open="open" @close="onClose">
    <template #trigger="{ toggle }">
      <IconButton
        class="colors-trigger"
        icon="mdi:palette-outline"
        :icon-size="28"
        :size="38"
        title="Colors"
        aria-label="Colors"
        aria-haspopup="dialog"
        :aria-expanded="open"
        @click="toggle"
      />
    </template>

    <div class="colors-panel">
      <ColorField
        label="Screen background"
        :model-value="colorToHex(screen.backgroundColor)"
        @update:model-value="emit('background', $event)"
      />

      <section class="colors-section">
        <MenuHeading>Defaults</MenuHeading>
        <div class="colors-fields">
          <ColorField v-model="iconDraft" label="Macro icon" />
          <ColorField v-model="bgDraft" label="Macro background" />
        </div>
      </section>
    </div>
  </Popover>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import ColorField from '~/components/input/ColorField.vue'
import IconButton from '~/components/ui/IconButton.vue'
import MenuHeading from '~/components/ui/MenuHeading.vue'
import Popover from '~/components/ui/Popover.vue'
import { colorToHex } from '~/../shared/types'
import type { MacroScreen } from '~/../shared/types'

const props = defineProps<{
  screen: MacroScreen
}>()

const emit = defineEmits<{
  background: [hex: string]
  macroColors: [colors: { icon: string; background: string }]
}>()

const open = ref(false)

const iconHex = computed(() => colorToHex(props.screen.defaultMacroIconColor ?? { r: 0, g: 0, b: 0 }))
const bgHex = computed(() => colorToHex(props.screen.defaultMacroBackgroundColor ?? { r: 255, g: 255, b: 255 }))

const iconDraft = ref(iconHex.value)
const bgDraft = ref(bgHex.value)

// Start each time from the screen's current defaults.
watch(open, (isOpen) => {
  if (!isOpen) return
  iconDraft.value = iconHex.value
  bgDraft.value = bgHex.value
})

// The defaults apply when the panel closes, so the "apply to existing macros?" prompt shows once.
function onClose() {
  if (iconDraft.value !== iconHex.value || bgDraft.value !== bgHex.value) {
    emit('macroColors', { icon: iconDraft.value, background: bgDraft.value })
  }
}
</script>

<style scoped>
.colors-trigger {
  margin: -8px 0 -14px;
}

.colors-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 15rem;
  padding: var(--space-3);
}

.colors-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.colors-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
