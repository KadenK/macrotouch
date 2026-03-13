<template>
  <div class="icon-search">
    <input
      v-model="searchQuery"
      type="text"
      placeholder="Search icons..."
      class="search-input"
      @input="emit('search', searchQuery)"
    />
    <span v-if="resultCount >= 0" class="result-count">{{ resultCount }} icons</span>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'

defineProps<{
  resultCount?: number
}>()

const emit = defineEmits<{
  search: [query: string]
}>()

const searchQuery = ref('')
</script>

<style scoped lang="postcss">
.icon-search {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.search-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.875rem;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
}

.result-count {
  font-size: 0.875rem;
  color: #6b7280;
  white-space: nowrap;
}
</style>
