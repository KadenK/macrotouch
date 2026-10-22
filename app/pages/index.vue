<template>
  <div class="page choose-page">
    <Icon class="logo" name="mt:logo" size="4rem" />
    <h1 class="brand">MacroTouch</h1>
    <p class="subtitle">What is this device?</p>
    <div class="choices">
      <!-- Plain links: a full page load makes the connection announce the right role. -->
      <a class="choice" href="/home">Editor</a>
      <a class="choice" href="/screen">Controller</a>
    </div>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
  layout: 'screen',
})
</script>

<style lang="postcss" scoped>
.choose-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  height: 100%;
}

.brand {
  font-size: clamp(1.8rem, 2.6vw, 2.8rem);
  font-weight: 700;
  color: #1d4ed8;
}

.subtitle {
  color: #475569;
}

.choices {
  display: flex;
  gap: var(--space-3);
}

.choice {
  background: rgba(29, 78, 216, 0.08);
  color: #0f172a;
  border: 1px solid rgba(29, 78, 216, 0.2);
  border-radius: 999px;
  padding: 0.8rem 2rem;
  font-size: 1.2rem;
  font-weight: 600;
  text-decoration: none;
}

.choice:hover {
  background: rgba(29, 78, 216, 0.14);
}
</style>
