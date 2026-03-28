<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

if (import.meta.client) {
  router.replace({ path: '/home' })
}
</script>

<template>
  <div />
</template>
