<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script lang="ts" setup>
import { useTheme } from '~/composables/useTheme'

useTheme().init()
</script>
