<template>
  <li class="sidebar-item" :class="{ 'sidebar-item--selected': selected, 'sidebar-item--muted': muted }">
    <slot name="content">
      <button type="button" class="sidebar-item-button" :aria-current="selected ? 'true' : undefined">
        <slot />
      </button>
    </slot>
    <!-- Optional trailing controls, e.g. a menu. -->
    <slot name="trailing" />
  </li>
</template>

<script lang="ts" setup>
defineProps<{
  selected?: boolean
  /** Subdued style for secondary entries such as "Add screen". */
  muted?: boolean
}>()
</script>

<style scoped>
.sidebar-item {
  display: flex;
  align-items: center;
  border-radius: var(--radius-sm);

  &:hover {
    background: var(--color-hover);
  }

  &.sidebar-item--selected {
    background: var(--color-primary-50);
    color: var(--color-primary);
    font-weight: 600;
  }

  &.sidebar-item--muted {
    margin-top: var(--space-1);
    color: var(--color-muted);

    &:hover {
      color: var(--color-ink);
    }
  }
}

.sidebar-item-button {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
