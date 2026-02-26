<template>
  <div>
    <div class="header">
      <h1 @click="navigateTo('/')">{{ name }}</h1>
      <div class="right-buttons">
        <button @click="navigateTo('/connect')">Connect</button>
        <button @click="navigateTo('/settings')">Settings</button>
      </div>
    </div>
    <slot />
    <footer></footer>
  </div>
</template>

<script lang="ts" setup>
const name = ref('MacroTouch')
</script>

<style lang="postcss">
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 4rem;
}
</style>
