<template>
  <nav class="nav-tabs">
    <slot />
  </nav>
</template>

<style scoped>
.nav-tabs {
  display: flex;
  align-self: stretch;
  gap: var(--space-2);
}
</style>
