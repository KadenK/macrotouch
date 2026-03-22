<template>
  <div class="app">
    <div class="screen-controls">
      <button @click="createNewScreen">Add Screen</button>
      <button v-if="currentScreenId" class="edit-btn" @click="openEditModal">Edit Current Screen</button>
      <button v-if="screenList.length" class="delete-btn" @click="deleteCurrentScreen">Delete Current Screen</button>
    </div>

    <select v-if="screenList.length" v-model="currentScreenId">
      <option v-for="screen in screenList" :key="screen.id" :value="screen.id">
        {{ screen.name }}
      </option>
    </select>

    <MacroGridScreen v-if="currentScreenId" :screen-id="currentScreenId" :editable="true" />
    <div v-else>No screens. Create one.</div>

    <ScreenEditModal v-model="isEditModalOpen" :screen-id="currentScreenId" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useMacroStore } from '~/stores/macro'
import MacroGridScreen from '../components/screen/screen.vue'
import { createMacroScreen } from '~/../types'
import { createColor } from '~/../types'
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
.app {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  font-family: sans-serif;
  padding: 1rem;
}

.screen-controls {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

select,
button {
  margin-bottom: 1rem;
  margin-right: 1rem;
}

.edit-btn {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.delete-btn {
  background-color: #ef4444;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.delete-btn:hover {
  background-color: #dc2626;
}
</style>
