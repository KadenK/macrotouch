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

const title = ref('Dashboard')

const dummyMacros = ref([
  { label: 'Macro 1', icon: null },
  { label: 'Macro 2', icon: null },
  { label: 'Macro 3', icon: null },
  { label: 'Macro 4', icon: null },
  { label: 'Macro 5', icon: null },
  { label: 'Macro 6', icon: null },
  { label: 'Macro 7', icon: null },
  { label: 'Macro 8', icon: null },
  { label: 'Macro 9', icon: null },
  { label: 'Macro 10', icon: null },
  { label: 'Macro 11', icon: null },
  { label: 'Macro 12', icon: null },
  { label: 'Macro 13', icon: null },
  { label: 'Macro 14', icon: null },
  { label: 'Macro 15', icon: null },
])

const isPickerOpen = ref(false)
const selectedMacroIndex = ref<number | null>(null)

const openIconPickerForMacro = (index: number) => {
  selectedMacroIndex.value = index
  isPickerOpen.value = true
}
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
