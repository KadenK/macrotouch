<template>
  <div class="macro-container">
    <button class="macro" @click="openIconPicker">
      <Icon v-if="selectedIconName" :name="`ic:${selectedIconName}`" class="macro-icon" />
      <span v-else class="placeholder-icon">+</span>
    </button>
    <span class="macro-label">{{ label }}</span>
    <IconPickerModal v-model="isPickerOpen" @select="handleIconSelect" />
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'

defineProps<{
  label?: string
}>()

const isPickerOpen = ref(false)
const selectedIconName = ref<string | null>(null)

const openIconPicker = () => {
  isPickerOpen.value = true
}

const handleIconSelect = (iconName: string) => {
  selectedIconName.value = iconName
}
</script>

<style lang="postcss" scoped>
.macro-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 100%;
  height: 100%;
}

.macro {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 8px;
  background-color: #cfcfcf;
  cursor: pointer;
  transition: all 0.2s ease;

  /* exterior drop shadow */
  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.1),
    0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.macro:hover {
  /* interior drop shadow */
  box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.1);
  transform: scale(0.98);
}

.placeholder-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  font-size: 3rem; /* makes the plus big */
  font-weight: 700;
  line-height: 1;
  color: #3b82f6; /* blue color */
  background: transparent;
  border-radius: 0; /* remove circle */
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
