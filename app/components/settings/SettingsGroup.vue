<template>
  <section class="settings-group">
    <h2 class="settings-group-title">{{ title }}</h2>
    <slot />
  </section>
</template>

<script lang="ts" setup>
defineProps<{
  title: string
}>()
</script>

<style scoped>
.settings-group {
  margin-bottom: var(--space-3);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  border: var(--border-width) solid var(--color-border);
  background: var(--color-surface);
}

.settings-group-title {
  margin-bottom: var(--space-2);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-ink);
}
</style>
