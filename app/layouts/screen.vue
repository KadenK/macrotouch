<template>
  <div class="screen-layout">
    <slot />
  </div>
</template>

<script lang="ts" setup></script>

<style lang="postcss" scoped>
.screen-layout {
  max-width: 100vw;
  max-height: 100vh;
}
</style>
