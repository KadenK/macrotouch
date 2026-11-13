<template>
  <ul class="menu-list" role="menu">
    <slot />
  </ul>
</template>

<style scoped>
.menu-list {
  min-width: 9rem;
  margin: 0;
  padding: var(--space-1);
  list-style: none;
}
</style>
