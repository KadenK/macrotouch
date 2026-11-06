<template>
  <SidebarItem :selected="selected">
    <template #content>
      <div v-if="renaming" class="rename-field">
        <UnderlineInput
          ref="input"
          v-model="draft"
          class="rename-input"
          aria-label="Screen name"
          @keydown.enter.prevent="commit"
          @keydown.esc.prevent="renaming = false"
          @blur="commit"
        />
      </div>

      <button v-else type="button" class="screen-select" :aria-current="selected ? 'true' : undefined" @click="emit('select')">
        {{ screen.name }}
      </button>
    </template>

    <template v-if="!renaming" #trailing>
      <Popover class="item-menu" role="menu">
        <template #trigger="{ toggle, open }">
          <IconButton
            icon="mdi:dots-horizontal"
            :icon-size="24"
            aria-label="Screen options"
            aria-haspopup="menu"
            :aria-expanded="open"
            @click="toggle"
          />
        </template>

        <template #default="{ close }">
          <MenuList>
            <MenuItem @click="onRename(close)">Rename</MenuItem>
            <MenuItem danger @click="onDelete(close)">Delete</MenuItem>
          </MenuList>
        </template>
      </Popover>
    </template>
  </SidebarItem>
</template>

<script lang="ts" setup>
import { nextTick, ref } from 'vue'
import IconButton from '~/components/ui/IconButton.vue'
import MenuItem from '~/components/ui/MenuItem.vue'
import MenuList from '~/components/ui/MenuList.vue'
import Popover from '~/components/ui/Popover.vue'
import SidebarItem from '~/components/ui/SidebarItem.vue'
import UnderlineInput from '~/components/ui/UnderlineInput.vue'

const props = defineProps<{
  screen: { id: string; name: string }
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
  rename: [name: string]
  delete: []
}>()

const renaming = ref(false)
const draft = ref('')
const input = ref<InstanceType<typeof UnderlineInput> | null>(null)

async function startRename() {
  draft.value = props.screen.name
  renaming.value = true
  await nextTick()
  input.value?.select()
}

function onRename(close: () => void) {
  close()
  startRename()
}

function onDelete(close: () => void) {
  close()
  emit('delete')
}

function commit() {
  if (!renaming.value) return
  renaming.value = false
  const name = String(draft.value).trim()
  if (name && name !== props.screen.name) emit('rename', name)
}
</script>

<style scoped>
.screen-select {
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-field {
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
}

.rename-input {
  width: 100%;
  font: inherit;
}

/* The menu button only shows while hovering/focusing the row or while its menu is open. */
.item-menu {
  flex-shrink: 0;
  margin-right: var(--space-1);
  opacity: 0;
}

:global(.sidebar-item:hover) .item-menu,
:global(.sidebar-item:focus-within) .item-menu,
.item-menu:has([aria-expanded='true']) {
  opacity: 1;
}
</style>
