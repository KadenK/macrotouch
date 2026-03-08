<template>
  <div class="screen-page">
    <Screen :items="macros" :editable="false" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'screen',
})

// Assuming macros will be fetched from API or store
// For now, use dummy data
const macros = [
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
]
</script>

<style scoped>
.screen-page {
  padding: 1rem;
}
</style>
