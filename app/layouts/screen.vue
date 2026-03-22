<template>
  <div class="screen-layout">
    <slot />
  </div>
</template>

<script lang="ts" setup></script>

<style lang="postcss" scoped>
.screen-layout {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}
</style>
