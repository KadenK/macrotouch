<template>
  <div class="screen-page">
    <Screen v-if="currentScreenId" :screen-id="currentScreenId" :editable="false" />
    <div v-else class="empty-state">No screens available.</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useMacroStore } from '~/stores/macro'
import Screen from '~/components/screen/screen.vue'

definePageMeta({
  layout: 'screen',
})

const store = useMacroStore()

const currentScreenId = ref('')
const screenList = computed(() => store.getScreenList())

onMounted(() => {
  if (!store.isReady) {
    const stop = watch(
      () => store.isReady,
      (ready) => {
        if (ready) {
          stop()
          if (screenList.value.length) {
            currentScreenId.value = screenList.value[0].id
          }
        }
      },
    )
  } else if (screenList.value.length) {
    currentScreenId.value = screenList.value[0].id
  }
})

watch(screenList, (list) => {
  if (!currentScreenId.value && list.length) {
    currentScreenId.value = list[0].id
  }
})
</script>

<style scoped>
.screen-page {
  padding: 1rem;
}

.empty-state {
  color: #6b7280;
}
</style>
