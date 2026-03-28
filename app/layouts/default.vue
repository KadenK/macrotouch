<template>
  <div>
    <div class="header">
      <div class="logo-title" @click="navigateTo('/home')">
        <Icon class="logo" name="mt:logo" size="2rem"></Icon>
        <h1 class="brand">MacroTouch</h1>
      </div>
      <div class="right-buttons">
        <InputButton @click="navigateTo('/connect')">Connect</InputButton>
        <InputButton @click="navigateTo('/settings')">Settings</InputButton>
      </div>
    </div>
    <slot />
    <footer></footer>
  </div>
</template>

<script lang="ts" setup></script>

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

.logo-title {
  display: flex;
  align-items: center;

  .logo {
    margin-top: -1rem;
    margin-right: 0.2rem;
  }
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
