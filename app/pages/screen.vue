<template>
  <div class="screen-page">
    <div v-if="screenList.length" class="screen-selector">
      <label for="screen-select">Screen:</label>
      <select id="screen-select" v-model="currentScreenId">
        <option v-for="screen in screenList" :key="screen.id" :value="screen.id">
          {{ screen.name }}
        </option>
      </select>
    </div>
    <Screen v-if="currentScreenId" :screen-id="currentScreenId" :editable="false" @macro-click="triggerMacro" />
    <div v-else>Loading screen...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMacroStore } from '~/stores/macro'
import Screen from '~/components/screen/screen.vue'
import { createScreen } from '~~/types/screen'
import { Color } from '~~/types'

definePageMeta({
  layout: 'screen',
})

const store = useMacroStore()
const currentScreenId = ref<string>('')

const screenList = computed(() => store.getScreenList())

onMounted(async () => {
  await store.init()
  // If no screens, create one
  if (screenList.value.length === 0) {
    const defaultScreen = createScreen('Screen 1', 3, 5, new Color(240, 240, 240))
    await store.addScreen(defaultScreen)
  }
  // Select the first screen by default
  if (screenList.value.length > 0 && !currentScreenId.value) {
    currentScreenId.value = screenList.value[0].id
  }
})

function triggerMacro(macroId: string) {
  console.log('Macro triggered:', macroId)
}
</script>

<style scoped>
.screen-page {
  padding: 1rem;
}
.screen-selector {
  margin-bottom: 1rem;
}
.screen-selector select {
  margin-left: 0.5rem;
  padding: 0.25rem;
}
</style>
