<template>
  <div class="menu-heading"><slot /></div>
</template>

<style scoped>
.menu-heading {
  padding-top: var(--space-2);
  border-top: var(--border-width) solid var(--color-border);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-muted);
}
</style>
