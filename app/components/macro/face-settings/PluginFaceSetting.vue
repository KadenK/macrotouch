<template>
  <div class="form-group">
    <label v-if="setting.label">{{ setting.label }}</label>
    <PluginElement
      :tag="setting.element"
      :properties="{ macro, state, value: faceSettings?.[setting.id] }"
      @change="faceSettings = { ...faceSettings, [setting.id]: $event }"
    />
  </div>
</template>

<script lang="ts" setup>
import PluginElement from '../PluginElement.vue'
import type { PluginFaceSetting } from '~/../shared/types/plugin'
import type { FaceSettingProps } from '~/composables/useMacroFace'

/**
 * A plugin's own face setting: its custom element gets `macro`,
 * `state` and `value`, and dispatches `change` with the new value, saved as
 * `faceSettings[setting.id]`.
 */
defineOptions({ inheritAttrs: false })
defineProps<FaceSettingProps & { setting: PluginFaceSetting }>()
const faceSettings = defineModel<Record<string, unknown> | undefined>('faceSettings')
</script>
