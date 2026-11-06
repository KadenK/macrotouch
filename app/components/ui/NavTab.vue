<template>
  <NuxtLink :to="to" class="nav-tab" active-class="nav-tab--active">
    <slot />
  </NuxtLink>
</template>

<script lang="ts" setup>
defineProps<{
  to: string
}>()
</script>

<style scoped>
.nav-tab {
  display: flex;
  align-items: center;
  padding: 0 var(--space-3);
  color: var(--color-muted);
  font-weight: 500;
  text-decoration: none;
  /* The underline is drawn inside the tab's bottom edge, over the header's own border. */
  box-shadow: inset 0 -2px 0 0 transparent;
  transition: color 0.1s ease, box-shadow 0.1s ease;

  &:hover {
    color: var(--color-ink);
  }

  &.nav-tab--active {
    color: var(--color-ink);
    box-shadow: inset 0 -2px 0 0 var(--color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }
}
</style>
