<template>
  <div class="macro-container" :class="{ 'macro-empty': !macro }" @click="handleClick">
    <div class="macro" :style="{ backgroundColor: macro ? colorToHex(macro.backgroundColor) : undefined }">
      <Icon
        v-if="macro"
        :name="macro.icon.source === 'LIBRARY' ? `ic:${macro.icon.value}` : ''"
        class="macro-icon"
        :style="{ color: colorToHex(macro.iconColor) }"
      />
    </div>
    <span v-if="macro" class="macro-label">{{ macro.name }}</span>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useMacroStore } from '~/stores/macro'
import type { Macro } from '~/../types'
import { colorToHex } from '~/../types/common'

const props = defineProps<{
  macroId: string
}>()

const store = useMacroStore()
const macro = computed<Macro | undefined>(() => store.getMacro(props.macroId))

function handleClick() {
  if (!macro.value) return
  store.triggerMacro(props.macroId)
}
</script>

<style scoped lang="postcss">
.macro-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.macro-empty {
  cursor: default;
}

.macro-empty .macro {
  background: transparent;
  box-shadow: none;
}

.macro-empty .macro-label {
  display: none;
}

.macro {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  transition: transform 0.1s ease;
}

.macro:active {
  transform: scale(0.95);
}

.placeholder-icon {
  font-size: 3rem;
  font-weight: 700;
  color: #3b82f6;
}

.macro-icon {
  width: 80px;
  height: 80px;
  font-size: 28px;
}

.macro-label {
  font-size: 0.75rem;
  color: var(--label-color, #333);
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
