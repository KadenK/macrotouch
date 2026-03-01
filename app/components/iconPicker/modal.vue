<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div class="modal-container">
        <div class="modal-header">
          <h2>Select an Icon</h2>
          <button class="close-button" aria-label="Close" @click="close">×</button>
        </div>

        <IconPickerSearch :result-count="filteredIcons.length" @search="handleSearch" />

        <IconPickerGrid :icons="filteredIcons" @select="handleSelectIcon" />
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import { useIconData } from '~/composables/useIconData'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [iconName: string]
}>()

const { loadIcons, searchIcons, icons } = useIconData()
const searchQuery = ref('')

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const filteredIcons = computed(() => {
  if (!searchQuery.value.trim()) {
    return icons.value
  }
  return searchIcons(searchQuery.value)
})

watch(
  () => isOpen.value,
  (newVal) => {
    if (newVal && icons.value.length === 0) {
      loadIcons()
    }
  },
  { immediate: true },
)

const handleSearch = (query: string) => {
  searchQuery.value = query
}

const handleSelectIcon = (iconName: string) => {
  emit('select', iconName)
  close()
}

const close = () => {
  isOpen.value = false
  searchQuery.value = ''
}
</script>

<style scoped lang="postcss">
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-container {
  background: white;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
  }
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;

  &:hover {
    color: #111827;
  }
}
</style>
