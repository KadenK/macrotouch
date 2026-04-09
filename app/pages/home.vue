<template>
  <div class="page">
    <div class="container">
      <div class="section">
        <div class="screen-controls">
          <button class="btn btn-primary" @click="createNewScreen">Add Screen</button>
          <button v-if="currentScreenId" class="btn btn-secondary" @click="openEditModal">Edit Current Screen</button>
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

    <ScreenEditModal
      v-model="isEditModalOpen"
      :screen-id="currentScreenId"
      :pending-screen="pendingNewScreen"
      @saved="onScreenSaved"
      @deleted="onScreenDeleted"
      @update:model-value="(v) => { if (!v) pendingNewScreen = null }"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import MacroGridScreen from '../components/screen/screen.vue'
import { createMacroScreen, createColor } from '~/../types'
import ScreenEditModal from '~/components/screen/ScreenEditModal.vue'

const store = useMacroStore()
const { settings } = storeToRefs(store)

const isEditModalOpen = ref(false)
const currentScreenId = ref<string>('')
const pendingNewScreen = ref<ReturnType<typeof createMacroScreen> | null>(null)

const screenList = computed(() => store.getScreenList())

function openEditModal() {
  if (currentScreenId.value) {
    isEditModalOpen.value = true
  }
}

function ensureScreenExists() {
  if (screenList.value.length === 0) {
    const defaultScreen = createMacroScreen(
      'Screen',
      { ...settings.value.defaultScreenSize },
      { ...settings.value.defaultScreenBgColor },
      createColor(0, 0, 0),
      createColor(255, 255, 255),
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
  const newScreen = createMacroScreen(
    'Screen',
    { ...settings.value.defaultScreenSize },
    { ...settings.value.defaultScreenBgColor },
    createColor(0, 0, 0),
    createColor(255, 255, 255),
  )
  pendingNewScreen.value = newScreen
  isEditModalOpen.value = true
}

function onScreenSaved(savedId: string) {
  pendingNewScreen.value = null
  currentScreenId.value = savedId
}

function onScreenDeleted() {
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
  background: var(--color-surface)
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
