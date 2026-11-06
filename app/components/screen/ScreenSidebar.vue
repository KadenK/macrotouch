<template>
  <SidebarSection title="Screens">
    <ScreenListItem
      v-for="screen in screens"
      :key="screen.id"
      :screen="screen"
      :selected="screen.id === selectedId"
      @select="emit('select', screen.id)"
      @rename="emit('rename', screen.id, $event)"
      @delete="emit('delete', screen.id)"
    />

    <SidebarItem muted @click="emit('add')">
      <Icon name="mdi:plus" size="1rem" />
      Add screen
    </SidebarItem>
  </SidebarSection>
</template>

<script lang="ts" setup>
import ScreenListItem from '~/components/screen/ScreenListItem.vue'
import SidebarItem from '~/components/ui/SidebarItem.vue'
import SidebarSection from '~/components/ui/SidebarSection.vue'

defineProps<{
  screens: { id: string; name: string }[]
  selectedId: string
}>()

const emit = defineEmits<{
  select: [id: string]
  add: []
  rename: [id: string, name: string]
  delete: [id: string]
}>()
</script>
