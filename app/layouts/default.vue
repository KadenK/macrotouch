<template>
  <div>
    <div class="header">
      <h1 class="brand" @click="navigateTo('/home')">{{ name }}</h1>
      <div class="right-buttons">
        <InputButton @click="navigateTo('/connect')">Connect</InputButton>
        <InputButton @click="navigateTo('/settings')">Settings</InputButton>
      </div>
    </div>
    <slot />
    <footer></footer>
  </div>
</template>

<script lang="ts" setup>
const name = ref('MacroTouch')
</script>

<style lang="postcss" scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 4rem;
  padding: 0 var(--space-8);
  margin-bottom: var(--space-3);
  padding-top: var(--space-2);
}

.brand {
  font-size: clamp(1.8rem, 2.6vw, 2.8rem);
  letter-spacing: -0.02em;
  font-weight: 700;
  color: #1d4ed8;
  text-shadow: 0 6px 20px rgba(29, 78, 216, 0.18);
  cursor: pointer;
  margin-left: var(--space-1);
}

.right-buttons {
  display: flex;
  gap: var(--space-3);
}
</style>
