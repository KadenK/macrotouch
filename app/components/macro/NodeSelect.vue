<template>
  <!-- Only worth asking with several action servers, or to show the saved one is offline. -->
  <div v-if="store.nodes.length > 1 || offline" class="form-group">
    <label for="macro-node">Runs on</label>
    <select id="macro-node" v-model="nodeId" class="text-input">
      <option v-if="offline" :value="nodeId">{{ nodeId }} (offline)</option>
      <option v-for="node in sortedNodes" :key="node.nodeId" :value="node.nodeId">
        {{ nodeLabel(node) }} ({{ node.platform }})
      </option>
    </select>
    <small v-if="offline" class="offline-note">This action server is offline; its target will be preserved.</small>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useMacroStore } from '~/stores/macro'
import { nodeLabel } from '~/../shared/types'

/** Which action server a macro runs on, this computer first. */
const nodeId = defineModel<string>({ required: true })
const store = useMacroStore()

const sortedNodes = computed(() => [...store.nodes].sort((a, b) => Number(b.local) - Number(a.local)))
const offline = computed(() => !!nodeId.value && !store.nodes.some((node) => node.nodeId === nodeId.value))
</script>

<style scoped>
.offline-note {
  color: var(--color-text-subtle);
}
</style>
