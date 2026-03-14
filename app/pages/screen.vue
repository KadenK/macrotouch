<!-- /pages/screen.vue -->
<template>
  <div class="screen-page">
    <Screen v-if="currentScreenId" :screen-id="currentScreenId" :editable="false" @macro-click="triggerMacro" />
    <div v-else>No screen available</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMacroStore } from '~/stores/macro'
import Screen from '~/components/screen/screen.vue'

definePageMeta({
  layout: 'screen',
})

const store = useMacroStore()
const currentScreenId = ref<string>('')

onMounted(() => {
  const screenList = store.getScreenList()
  if (screenList.length > 0) {
    currentScreenId.value = screenList[0].id
  }
})

function triggerMacro(macroId: string) {
  const macro = store.getMacro(macroId)
  if (macro) {
    console.log('Triggering macro:', macro.name, 'with action:', macro.action.name)
    // TODO: Instantiate and execute the actual action based on macro.action.type
    // For now, we just log
  }
}
</script>

<style scoped>
.screen-page {
  padding: 1rem;
}
</style>
