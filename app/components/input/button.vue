<template>
  <button class="input-button">
    <slot />
  </button>
</template>

<script lang="ts" setup></script>

<style lang="postcss" scoped>
.input-button {
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.5rem 1rem;
}
</style>
