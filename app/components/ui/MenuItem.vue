<template>
  <li role="none">
    <button type="button" role="menuitem" class="menu-item" :class="{ 'menu-item--danger': danger }">
      <slot />
    </button>
  </li>
</template>

<script lang="ts" setup>
defineProps<{
  danger?: boolean
}>()
</script>

<style scoped>
.menu-item {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--color-ink);
  font: inherit;
  font-weight: 400;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--color-hover);
  }
}

.menu-item--danger {
  color: var(--color-danger);
}
</style>
