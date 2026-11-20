<template>
  <!-- On the bottom edge of the face. Inherits its color, so pass one that reads on the background. -->
  <span class="face-label">{{ name }}</span>
</template>

<script lang="ts" setup>
/** A macro's name, drawn by a face when labels are on. */
defineProps<{ name: string }>()
</script>

<style scoped>
.face-label {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 0 0.5rem 0.4rem;
  font-size: 0.75rem;
  line-height: 1.2;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
