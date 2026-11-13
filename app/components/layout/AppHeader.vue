<template>
  <header class="app-header">
    <NuxtLink to="/home" class="brand-link">
      <Icon class="logo" name="mt:logo" size="2rem" />
      <span class="brand">MacroTouch</span>
    </NuxtLink>

    <NavTabs class="header-tabs" aria-label="Main">
      <NavTab to="/home">Home</NavTab>
      <NavTab to="/connect">Connect</NavTab>
      <NavTab to="/settings">Settings</NavTab>
    </NavTabs>

    <ConnectionStatus inline class="header-status" />
  </header>
</template>

<script lang="ts" setup>
import ConnectionStatus from '~/components/ConnectionStatus.vue'
import NavTab from '~/components/ui/NavTab.vue'
import NavTabs from '~/components/ui/NavTabs.vue'
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 3.5rem;
  padding: 0 var(--space-6);
  background: var(--color-surface);
  border-bottom: var(--border-width) solid var(--color-border);
}

.brand-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* The icon's glyphs span 28px of its 32px box; 2.4rem puts the "M" cap height at that same 28px. */
.brand {
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--color-primary);
}

.header-tabs {
  margin-left: var(--space-8);
}

/* Pushed to the right edge; only present while the connection is down. */
.header-status {
  margin-left: auto;
}
</style>
