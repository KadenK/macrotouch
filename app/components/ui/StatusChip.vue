<template>
  <span class="chip" :class="tone"><slot /></span>
</template>

<script lang="ts" setup>
/** A small pill naming a status. */
withDefaults(defineProps<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' }>(), { tone: 'neutral' })
</script>

<style scoped>
.chip {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-hover);
  color: var(--color-text-subtle);
  font-size: var(--text-xs);
}
.success {
  color: var(--color-primary);
  background: var(--color-primary-50);
}
.warning {
  color: var(--color-secondary-600);
}
.danger {
  color: var(--color-danger);
}
</style>
