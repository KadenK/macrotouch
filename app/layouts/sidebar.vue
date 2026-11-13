<template>
  <div class="app-shell">
    <AppHeader />
    <NotPaired />
    <div class="sidebar-layout">
      <!-- Pages fill this with <SidebarContent>. -->
      <aside id="layout-sidebar" class="layout-sidebar"></aside>
      <main class="layout-main">
        <slot />
      </main>
    </div>
  </div>
</template>

<script lang="ts" setup>
import AppHeader from '~/components/layout/AppHeader.vue'
import NotPaired from '~/components/NotPaired.vue'
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.sidebar-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.layout-sidebar {
  flex-shrink: 0;
  width: 13.5rem;
  overflow-y: auto;
  background: var(--color-surface);
  border-right: var(--border-width) solid var(--color-border);
}

.layout-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
</style>
