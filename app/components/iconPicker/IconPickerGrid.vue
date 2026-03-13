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
        <Icon :name="`ic:${iconName}`" class="icon-svg" />
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
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #3b82f6;
    background: #f0f9ff;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}

.icon-svg {
  width: 32px;
  height: 32px;
  font-size: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #374151;
}

.icon-name {
  font-size: 0.65rem;
  color: #6b7280;
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
  color: #9ca3af;
  font-size: 0.875rem;
}
</style>
