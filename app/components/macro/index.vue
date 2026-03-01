<template>
  <div class="macro-container">
    <button class="macro" @click="openIconPicker">
      <Icon v-if="selectedIconName" :name="`ic:${selectedIconName}`" class="macro-icon" />
      <span v-else>Select Icon</span>
    </button>

    <IconPickerModal v-model="isPickerOpen" @select="handleIconSelect" />
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'

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
  align-items: center;
  justify-content: center;
}

.macro {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  background: white;
  color: #3b82f6;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #eff6ff;
    border-color: #2563eb;
  }

  &:active {
    transform: scale(0.95);
  }
}

.macro-icon {
  width: 28px;
  height: 28px;
  font-size: 28px;
}
</style>
