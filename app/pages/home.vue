<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<!-- /app/pages/home.vue -->
<template>
  <div class="app">
    <h2>{{ title }}</h2>
    <div class="screen-controls">
      <button @click="createNewScreen">Add Screen</button>
      <button v-if="screenList.length" class="delete-btn" @click="deleteCurrentScreen">Delete Current Screen</button>
    </div>
    <select v-if="screenList.length" v-model="currentScreenId">
      <option v-for="screen in screenList" :key="screen.id" :value="screen.id">
        {{ screen.name }}
      </option>
    </select>
    <MacroGridScreen v-if="currentScreenId" :screen-id="currentScreenId" :editable="true" />
    <div v-else>No screens. Create one.</div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import MacroGridScreen from '../components/screen/screen.vue'
import { createScreen } from '~/../types/screen'
import { Color } from '~/../types/common'

const store = useMacroStore()
await store.init()
storeToRefs(store)

const title = ref('Dashboard')
const currentScreenId = ref<string>('')

const screenList = computed(() => store.getScreenList())

// On mount, if no screens exist, create a default one
onMounted(async () => {
  await store.init()
  if (screenList.value.length === 0) {
    const defaultScreen = createScreen('Screen 1', 3, 5, new Color(240, 240, 240))
    await store.addScreen(defaultScreen)
    currentScreenId.value = defaultScreen.id
  } else {
    currentScreenId.value = screenList.value[0].id
  }
})

function createNewScreen() {
  const newScreen = createScreen(`Screen ${screenList.value.length + 1}`, 3, 5)
  store.addScreen(newScreen)
  currentScreenId.value = newScreen.id
}

function deleteCurrentScreen() {
  if (!currentScreenId.value) return

  const confirmDelete = confirm(`Are you sure you want to delete the screen "${getCurrentScreenName()}"?`)
  if (!confirmDelete) return

  store.deleteScreen(currentScreenId.value)

  // Update selection
  if (screenList.value.length > 0) {
    currentScreenId.value = screenList.value[0].id
  } else {
    currentScreenId.value = ''
  }
}

function getCurrentScreenName(): string {
  const screen = screenList.value.find((s) => s.id === currentScreenId.value)
  return screen?.name || 'Unknown'
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

h2 {
  margin-bottom: 1rem;
  color: #333;
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
