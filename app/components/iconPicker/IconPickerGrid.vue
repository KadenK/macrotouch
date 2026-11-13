<template>
  <div class="icon-grid">
    <div class="grid-container">
      <button
        v-for="iconName in displayedIcons"
        :key="iconName"
        class="icon-item"
        :title="iconName"
        @click="emit('select', iconName)"
      >
        <Icon :name="iconName" class="icon-svg" />
        <span class="icon-name">{{ iconName }}</span>
      </button>
    </div>
    <!-- Sentinel element for infinite scroll detection -->
    <div ref="sentinel" class="sentinel" />
    <div v-if="icons.length === 0" class="empty-state">No icons found</div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue'

const ICONS_PER_BATCH = 75

const props = defineProps<{
  icons: string[]
}>()

const emit = defineEmits<{
  select: [iconName: string]
}>()

const sentinel = ref<HTMLElement | null>(null)
const loadedCount = ref(ICONS_PER_BATCH)

const displayedIcons = computed(() => {
  return props.icons.slice(0, loadedCount.value)
})

watch(
  () => props.icons,
  () => {
    // Reset loaded count when icons change (e.g., from search)
    loadedCount.value = ICONS_PER_BATCH
  },
)

const loadMore = () => {
  if (loadedCount.value < props.icons.length) {
    loadedCount.value += ICONS_PER_BATCH
  }
}

onMounted(() => {
  if (!sentinel.value) return

  // Find the nearest scrollable parent (modal-body)
  const scrollableParent = sentinel.value.closest('.modal-body') || document.querySelector('.icon-grid')

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadMore()
        }
      })
    },
    {
      root: scrollableParent,
      rootMargin: '100px',
      threshold: 0.01,
    },
  )

  observer.observe(sentinel.value)
})
</script>

<style scoped lang="postcss">
.icon-grid {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 0.5rem;
  padding: 1rem;
  align-content: start;
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.5rem;
  margin: 0;
  border: var(--border-width) solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text-label);
  cursor: pointer;
  transition: background-color 0.1s ease, border-color 0.1s ease;

  &:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-50);
  }

}

.icon-svg {
  width: 32px;
  height: 32px;
  font-size: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-label);
}

.icon-name {
  font-size: 0.65rem;
  color: var(--color-text-subtle);
  text-align: center;
  word-break: break-word;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  max-width: 100%;
}

.sentinel {
  width: 1px;
  height: 1px;
  visibility: hidden;
  pointer-events: none;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-faint);
  font-size: 0.875rem;
}
</style>
