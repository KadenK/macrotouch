<template>
  <button class="input-button">
    <slot />
  </button>
</template>

<script lang="ts" setup></script>

<style lang="postcss" scoped>
.input-button {
  background: rgba(29, 78, 216, 0.08);
  color: #0f172a;
  border: 1px solid rgba(29, 78, 216, 0.2);
  border-radius: 999px;
  padding: 0.45rem 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.input-button:hover {
  background: rgba(29, 78, 216, 0.14);
  box-shadow: 0 6px 16px rgba(29, 78, 216, 0.18);
  transform: translateY(-1px);
}
</style>
