<template>
  <div>
    <div class="header">
      <h1 @click="navigateTo('/home')">{{ name }}</h1>
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
}
</style>
