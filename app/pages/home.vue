<template>
  <div class="page">
    <div class="container">
      <div class="section">
        <div class="screen-controls">
          <button class="btn btn-primary" @click="createNewScreen">Add Screen</button>
          <button v-if="currentScreenId" class="btn btn-secondary" @click="openEditModal">
            Edit Current Screen
          </button>
          <button v-if="screenList.length" class="btn btn-ghost" @click="deleteCurrentScreen">
            Delete Current Screen
          </button>
        </div>

        <select v-if="screenList.length" v-model="currentScreenId" class="screen-select">
          <option v-for="screen in screenList" :key="screen.id" :value="screen.id">
            {{ screen.name }}
          </option>
        </select>
      </div>

      <div class="macro-surface">
        <MacroGridScreen v-if="currentScreenId" class="macro-grid" :screen-id="currentScreenId" :editable="true" />
        <div v-else class="empty-state">No screens yet. Create one to begin.</div>
      </div>
    </div>

    <ScreenEditModal v-model="isEditModalOpen" :screen-id="currentScreenId" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useMacroStore } from '~/stores/macro'
import MacroGridScreen from '../components/screen/screen.vue'
import { createMacroScreen, createColor } from '~/../types'
import ScreenEditModal from '~/components/screen/ScreenEditModal.vue'

const store = useMacroStore()
const isEditModalOpen = ref(false)
const title = ref('Dashboard')
const currentScreenId = ref<string>('')

const screenList = computed(() => store.getScreenList())

function getCurrentScreenName(): string {
  return screenList.value.find((s) => s.id === currentScreenId.value)?.name ?? 'Unknown'
}

function openEditModal() {
  if (currentScreenId.value) {
    isEditModalOpen.value = true
  }
}

function ensureScreenExists() {
  const defaultIconColor = createColor(0, 0, 0)
  const defaultBgColor = createColor(255, 255, 255)

  if (screenList.value.length === 0) {
    const defaultScreen = createMacroScreen(
      'Screen 1',
      { rows: 3, columns: 5 },
      createColor(240, 240, 240),
      defaultIconColor,
      defaultBgColor,
    )
    store.addScreen(defaultScreen)
    currentScreenId.value = defaultScreen.id
  } else {
    currentScreenId.value = screenList.value[0].id
  }
}

onMounted(() => {
  if (!store.isReady) {
    const stop = watch(
      () => store.isReady,
      (ready) => {
        if (ready) {
          stop()
          ensureScreenExists()
        }
      },
    )
  } else {
    ensureScreenExists()
  }
})

watch(screenList, (screens) => {
  if (!currentScreenId.value && screens.length) {
    currentScreenId.value = screens[0].id
  }
})

function createNewScreen() {
  const defaultIconColor = createColor(0, 0, 0)
  const defaultBgColor = createColor(255, 255, 255)

  const newScreen = createMacroScreen(
    'Screen 1',
    { rows: 3, columns: 5 },
    createColor(240, 240, 240),
    defaultIconColor,
    defaultBgColor,
  )
  store.addScreen(newScreen)
  currentScreenId.value = newScreen.id
  isEditModalOpen.value = true   // ← add this line
}

function deleteCurrentScreen() {
  if (!currentScreenId.value) return

  const confirmed = confirm(`Are you sure you want to delete the screen "${getCurrentScreenName()}"?`)
  if (!confirmed) return

  store.deleteScreen(currentScreenId.value)

  if (screenList.value.length > 0) {
    currentScreenId.value = screenList.value[0].id
  } else {
    currentScreenId.value = ''
  }
}
</script>

<style scoped>
.screen-controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.screen-select {
  appearance: none;
  width: 100%;
  max-width: 16rem;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background:
    var(--color-surface)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7l5 6 5-6' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    no-repeat;
  background-position: right 1rem center;
  background-size: 1.1rem 1.1rem;
  margin-bottom: var(--space-3);
  padding-right: 3rem;
}

.empty-state {
  padding: var(--space-8);
  border-radius: var(--radius-lg);
  background: var(--color-primary-50);
  color: var(--color-muted);
}

.macro-surface {
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.macro-grid {
  width: 100%;
  max-width: 70rem;
  min-width: 30rem;
  height: 100%;
  min-height: 20rem;
  max-height: 50rem;
}
</style>
