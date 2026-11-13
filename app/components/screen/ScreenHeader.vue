<template>
  <div class="screen-header">
    <ScreenName class="header-name" :name="screen.name" @rename="emit('rename', $event)" />

    <GridSizeInput :size="screen.size" @resize="emit('resize', $event)" />

    <div class="header-actions">
      <ScreenColorsMenu
        :screen="screen"
        @background="emit('background', $event)"
        @macro-colors="emit('macroColors', $event)"
      />

      <Popover role="menu">
        <template #trigger="{ open, toggle }">
          <IconButton
            class="options-trigger"
            icon="mdi:dots-horizontal"
            :icon-size="40"
            :size="38"
            aria-label="Screen options"
            aria-haspopup="menu"
            :aria-expanded="open"
            @click="toggle"
          />
        </template>

        <template #default="{ close }">
          <MenuList>
            <MenuItem danger @click="onDelete(close)">Delete screen</MenuItem>
          </MenuList>
        </template>
      </Popover>
    </div>
  </div>
</template>

<script lang="ts" setup>
import GridSizeInput from '~/components/screen/GridSizeInput.vue'
import ScreenColorsMenu from '~/components/screen/ScreenColorsMenu.vue'
import ScreenName from '~/components/screen/ScreenName.vue'
import IconButton from '~/components/ui/IconButton.vue'
import MenuItem from '~/components/ui/MenuItem.vue'
import MenuList from '~/components/ui/MenuList.vue'
import Popover from '~/components/ui/Popover.vue'
import type { MacroScreen } from '~/../shared/types'

defineProps<{
  screen: MacroScreen
}>()

const emit = defineEmits<{
  rename: [name: string]
  resize: [size: { rows: number; columns: number }]
  background: [hex: string]
  macroColors: [colors: { icon: string; background: string }]
  delete: []
}>()

function onDelete(close: () => void) {
  close()
  emit('delete')
}
</script>

<style scoped>
.screen-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-4);
  margin: 0 var(--space-5) var(--space-3);
}

.header-name {
  justify-self: start;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-self: end;
  gap: var(--space-3);
}

.options-trigger {
  margin: -8px 0 -14px;
}
</style>
