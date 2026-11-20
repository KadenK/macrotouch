<template>
  <div class="form-group">
    <label>Icon</label>
    <IconInput
      v-model="icon"
      :icon-color="colorToHex(base.iconColor)"
      :background-color="colorToHex(base.backgroundColor)"
      with-button
    />
  </div>
</template>

<script lang="ts" setup>
import IconInput from '~/components/input/iconInput.vue'
import { colorToHex } from '~/../shared/types'
import type { BaseFaceSettings, FaceSettingProps } from '~/composables/useMacroFace'

/** The `icon` face setting: the macro's one icon. */
defineOptions({ inheritAttrs: false })
defineProps<FaceSettingProps>()
const base = defineModel<BaseFaceSettings>('base', { required: true })

const icon = computed({
  get: () => base.value.icon,
  set: (value) => (base.value = { ...base.value, icon: value }),
})
</script>
