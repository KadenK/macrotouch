<template>
  <div class="icon-search">
    <input
      ref="searchInput"
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
import { ref, onMounted, nextTick } from 'vue'

defineProps<{
  resultCount?: number
}>()

const emit = defineEmits<{
  search: [query: string]
}>()

const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  await nextTick()
  searchInput.value?.focus()
})
</script>

<style scoped lang="postcss">
.icon-search {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
}

.search-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: var(--border-width) solid var(--color-input-border);
  border-radius: 4px;
  background: var(--color-input-bg);
  color: var(--color-text-strong);
  font-size: 0.875rem;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
}

.result-count {
  font-size: 0.875rem;
  color: var(--color-text-subtle);
  white-space: nowrap;
}
</style>
