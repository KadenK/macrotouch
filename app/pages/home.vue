<template>
  <div class="page">
    <div class="container">
      <div class="section">
        <div class="screen-controls">
          <button class="btn btn-primary" @click="createNewScreen">Add Screen</button>
          <button v-if="currentScreenId" class="btn btn-secondary" @click="openEditModal">Edit Current Screen</button>
        </div>

        <SelectMenu v-if="screenList.length" v-model="currentScreenId" :options="screenOptions" class="screen-select" />
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
      @update:model-value="
        (v) => {
          if (!v) pendingNewScreen = null
        }
      "
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import MacroGridScreen from '../components/screen/screen.vue'
import { createMacroScreen, createColor } from '~/../shared/types'
import ScreenEditModal from '~/components/screen/ScreenEditModal.vue'
import SelectMenu from '~/components/ui/SelectMenu.vue'

const store = useMacroStore()
const { settings } = storeToRefs(store)

const isEditModalOpen = ref(false)
const currentScreenId = ref<string>('')
const pendingNewScreen = ref<ReturnType<typeof createMacroScreen> | null>(null)

const screenList = computed(() => store.getScreenList())
const screenOptions = computed(() => screenList.value.map((s) => ({ value: s.id, label: s.name })))

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
  margin-bottom: var(--space-3);
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
  border: var(--border-width) solid var(--color-border);
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
