<template><component :is="tag" ref="element" class="plugin-element" @trigger="trigger" @change="change" /></template>
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
const props = defineProps<{ tag: string; properties: Record<string, unknown> }>()
const emit = defineEmits<{ trigger: [value: unknown]; change: [value: unknown] }>()
const element = ref<HTMLElement>()
let ready = false
function assign() {
  if (ready && element.value) Object.assign(element.value, props.properties)
}
onMounted(async () => {
  await customElements.whenDefined(props.tag)
  ready = true
  assign()
})
watch(() => props.properties, assign, { deep: true, flush: 'post' })
function trigger(event: Event) {
  emit('trigger', (event as CustomEvent).detail)
}
function change(event: Event) {
  emit('change', (event as CustomEvent).detail)
}
</script>
<style scoped>
.plugin-element {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
