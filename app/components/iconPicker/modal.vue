<template>
  <Modal v-model="isOpen" title="Select an Icon" :show-close="true" :fixed-size="true">
    <template #search>
      <IconPickerSearch :result-count="filteredIcons.length" @search="handleSearch" />
    </template>
    <IconPickerGrid :icons="filteredIcons" @select="handleSelectIcon" />
  </Modal>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import { useIconData } from '~/composables/useIconData'
import Modal from '~/components/ui/Modal.vue'

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

