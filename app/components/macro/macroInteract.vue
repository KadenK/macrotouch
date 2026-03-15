<template>
  <div class="macro-container" @click="handleClick">
    <div class="macro" :style="{ backgroundColor: macro?.backgroundColor.toHex() }">
      <Icon
        v-if="macro"
        :name="macro.icon.source === 'LIBRARY' ? `ic:${macro.icon.value}` : ''"
        class="macro-icon"
        :style="{ color: macro.iconColor.toHex() }"
      />
      <span v-else class="placeholder-icon">+</span>
    </div>
    <span class="macro-label">{{ macro?.name || 'Empty' }}</span>
  </div>
</template>

<script lang="ts" setup>
import type { MacroData } from '~/../types'

const props = defineProps<{
  macro?: MacroData
}>()

const emit = defineEmits<{
  (e: 'click', macroId: string): void
}>()

function handleClick() {
  if (props.macro) {
    emit('click', props.macro.id)
  }
}
</script>

<style scoped lang="postcss">
.macro-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.macro {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  transition: transform 0.1s ease;
}

.macro:active {
  transform: scale(0.95);
}

.placeholder-icon {
  font-size: 3rem;
  font-weight: 700;
  color: #3b82f6;
}

.macro-icon {
  width: 80px;
  height: 80px;
  font-size: 28px;
}

.macro-label {
  font-size: 0.75rem;
  color: #333;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
