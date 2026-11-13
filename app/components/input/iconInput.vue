<template>
  <div class="icon-row">
    <button type="button" class="icon-preview" :style="{ background: backgroundColor }" @click="isPickerOpen = true">
      <Icon
        v-if="icon.source === 'LIBRARY'"
        :name="normalizeIconValue(icon.value)"
        class="preview-icon"
        :style="{ color: iconColor }"
      />
      <span v-else class="preview-placeholder">?</span>
    </button>
    <button v-if="withButton" type="button" class="small-btn" @click="isPickerOpen = true">Choose Icon</button>
  </div>

  <IconPickerModal v-model="isPickerOpen" @select="select" />
</template>

<script lang="ts" setup>
import IconPickerModal from '~/components/iconPicker/IconPickerModal.vue'
import { normalizeIconValue } from '~/composables/useIconData'
import type { Icon } from '~/../shared/types'
import { IconSource } from '~/../shared/types/macro'

/** An icon drawn in its colors. Clicking it opens the icon picker. */
defineProps<{
  iconColor: string
  backgroundColor: string
  /** Also show a "Choose Icon" button beside it. */
  withButton?: boolean
}>()

const icon = defineModel<Icon>({ required: true })
const isPickerOpen = ref(false)

function select(iconName: string) {
  icon.value = { source: IconSource.Library, value: iconName }
  isPickerOpen.value = false
}
</script>

<style scoped lang="postcss">
.icon-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.small-btn {
  padding: 0.5rem;
  width: 96px;
  height: 32px;
  background-color: var(--color-neutral);
  color: var(--color-text-strong);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  text-align: center;
  line-height: 1.2;
}

.icon-preview {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  padding: 0;
  border: var(--border-width) solid var(--color-input-border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.preview-icon {
  width: 48px;
  height: 48px;
  font-size: 48px;
}

.preview-placeholder {
  font-size: 24px;
  color: var(--color-text-faint);
}
</style>
