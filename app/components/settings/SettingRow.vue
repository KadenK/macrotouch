<template>
  <div class="setting-row" :class="{ 'is-disabled': disabled }">
    <span class="setting-label">
      {{ label }}
      <small v-if="hint" class="setting-hint">{{ hint }}</small>
    </span>
    <slot />
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  label: string
  /** Small explanatory text under the label. */
  hint?: string
  disabled?: boolean
}>()
</script>

<style scoped>
.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  margin: var(--space-3) 0;
  color: var(--color-ink-2);

  &.is-disabled {
    opacity: 0.55;
  }
}

.setting-hint {
  display: block;
  font-size: 0.8rem;
  color: var(--color-text-subtle);
}
</style>
