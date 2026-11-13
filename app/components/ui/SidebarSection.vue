<template>
  <nav class="sidebar-section" :aria-label="title">
    <div class="sidebar-section-title">{{ title }}</div>
    <ul class="sidebar-section-list">
      <slot />
    </ul>
  </nav>
</template>

<script lang="ts" setup>
defineProps<{
  title: string
}>()
</script>

<style scoped>
.sidebar-section {
  padding: var(--space-3) var(--space-2);
}

.sidebar-section-title {
  padding: var(--space-1) var(--space-3) var(--space-2);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-muted);
}

.sidebar-section-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
