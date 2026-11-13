<template>
  <button type="button" class="icon-button" :style="{ width: `${size}px`, height: `${size}px` }">
    <Icon :name="icon" :size="`${iconSize}px`" />
  </button>
</template>

<script lang="ts" setup>
// Plain icon button: no outline or fill. Attributes (aria-*, title, listeners) fall through to the <button>.
withDefaults(
  defineProps<{
    icon: string
    /** Icon size in px. */
    iconSize?: number
    /** Button hit area in px. */
    size?: number
  }>(),
  { iconSize: 24, size: 28 },
)
</script>

<style scoped>
.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--color-ink);
  cursor: pointer;
  transition: color 0.1s ease;

  &:hover,
  &[aria-expanded='true'] {
    color: var(--color-ink-2);
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}
</style>
