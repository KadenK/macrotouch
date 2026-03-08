<template>
  <div class="app">
    <h2>{{ title }}</h2>
    <MacroGridScreen
      :items="dummyMacros"
      :columns="5"
      :rows="3"
      :editable="true"
      @select-icon="openIconPickerForMacro"
    />
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import MacroGridScreen from '../components/screen/screen.vue'
import { useWebSocket } from '../composables/useWebSocket'

const title = ref('Dashboard')

const dummyMacros = ref([
  { id: 1, label: 'Macro 1', icon: null },
  { id: 2, label: 'Macro 2', icon: null },
  { id: 3, label: 'Macro 3', icon: null },
  { id: 4, label: 'Macro 4', icon: null },
  { id: 5, label: 'Macro 5', icon: null },
  { id: 6, label: 'Macro 6', icon: null },
  { id: 7, label: 'Macro 7', icon: null },
  { id: 8, label: 'Macro 8', icon: null },
  { id: 9, label: 'Macro 9', icon: null },
  { id: 10, label: 'Macro 10', icon: null },
  { id: 11, label: 'Macro 11', icon: null },
  { id: 12, label: 'Macro 12', icon: null },
  { id: 13, label: 'Macro 13', icon: null },
  { id: 14, label: 'Macro 14', icon: null },
  { id: 15, label: 'Macro 15', icon: null },
])

const isPickerOpen = ref(false)
const selectedMacroIndex = ref<number | null>(null)

const openIconPickerForMacro = (index: number) => {
  selectedMacroIndex.value = index
  isPickerOpen.value = true
}

// Use WebSocket for real-time updates and triggers
const { isConnected } = useWebSocket()
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  font-family: sans-serif;
}

h2 {
  margin-bottom: 2rem;
  color: #333;
}
</style>
