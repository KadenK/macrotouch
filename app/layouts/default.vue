<template>
  <div class="app-shell">
    <AppHeader />
    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<script lang="ts" setup>
import AppHeader from '~/components/layout/AppHeader.vue'
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-6);
}
</style>
