<template>
  <SettingsGroup title="Install">
    <p class="note">
      Plugins run with full access to this computer and every action server. Only install plugins you trust.
    </p>
    <p class="note">To update a plugin, install its new version here. Its settings and secrets are kept.</p>
    <div class="install-actions">
      <label class="file-button"
        >Install from folder <input type="file" webkitdirectory multiple @change="installFolder"
      /></label>
      <label class="file-button"
        >Install from file <input type="file" accept=".mtplugin.json,application/json" @change="installFile"
      /></label>
    </div>
    <p v-if="message" class="install-status" :class="{ error: messageError }" role="status">{{ message }}</p>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SettingsGroup from '~/components/settings/SettingsGroup.vue'
import { useMacroStore } from '~/stores/macro'
import { errorText } from '~/../shared/errors'
import { PLUGIN_PACKAGE_LIMITS, isSafePluginPath, type PluginFiles } from '~/../shared/types/plugin'

/** Installs or updates a plugin from a folder or a packed `.mtplugin.json`, after asking. */
const store = useMacroStore()
const message = ref('')
const messageError = ref(false)

/** The id, name and version a package says it is, read from its `package.json`. */
function packageInfo(files: PluginFiles): { id: string; label: string; version: string } {
  const encoded = files['package.json']
  if (!encoded) throw new Error('Not a plugin package: package.json is missing')
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
  const pkg = JSON.parse(new TextDecoder().decode(bytes)) as {
    version?: string
    macrotouch?: { id?: string; label?: string }
  }
  if (!pkg.macrotouch?.id) throw new Error('Not a plugin package: macrotouch.id is missing')
  return { id: pkg.macrotouch.id, label: pkg.macrotouch.label ?? pkg.macrotouch.id, version: pkg.version ?? '' }
}

/** Compare dotted versions numerically; non-numeric parts compare as text. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '0'
    const y = pb[i] ?? '0'
    const diff = /^\d+$/.test(x) && /^\d+$/.test(y) ? Number(x) - Number(y) : x.localeCompare(y)
    if (diff) return Math.sign(diff)
  }
  return 0
}

/**
 * Install a package, or update the plugin it belongs to when that is already
 * installed (settings and secrets are kept). Returns what happened, in words.
 */
async function install(files: PluginFiles): Promise<string | undefined> {
  const info = packageInfo(files)
  const existing = store.plugins[info.id]
  if (existing) {
    const order = compareVersions(info.version, existing.version)
    const question =
      order > 0
        ? `Update ${existing.label} from ${existing.version} to ${info.version}?`
        : order < 0
          ? `${existing.label} ${info.version} is older than the installed ${existing.version}. Replace it anyway?`
          : `Reinstall ${existing.label} ${info.version}?`
    if (!confirm(question)) return undefined
    await store.installPlugin(files)
    return order === 0
      ? `Reinstalled ${existing.label} ${info.version}.`
      : `Updated ${existing.label} from ${existing.version} to ${info.version}. Settings and secrets were kept.`
  }
  if (!confirm('Plugins run with full access to this computer and every action server. Install this plugin?'))
    return undefined
  await store.installPlugin(files)
  return `Installed ${info.label} ${info.version}.`
}

/** Read the chosen files into a package, install it, and report the outcome; then reset the input. */
async function installFrom(event: Event, read: (files: File[]) => Promise<PluginFiles | undefined>) {
  const input = event.target as HTMLInputElement
  messageError.value = false
  try {
    const files = await read(Array.from(input.files ?? []))
    if (files) {
      message.value = store.plugins[packageInfo(files).id] ? 'Updating…' : 'Installing…'
      message.value = (await install(files)) ?? ''
    }
  } catch (error) {
    messageError.value = true
    message.value = errorText(error)
  }
  input.value = ''
}

function installFile(event: Event) {
  return installFrom(event, async ([file]) => (file ? (JSON.parse(await file.text()) as PluginFiles) : undefined))
}

function installFolder(event: Event) {
  return installFrom(event, async (chosen) => {
    const files: PluginFiles = {}
    let bytes = 0
    for (const file of chosen) {
      const path = file.webkitRelativePath.split('/').slice(1).join('/')
      if (path.split('/').some((part) => part.startsWith('.') || part === 'node_modules')) continue
      if (!isSafePluginPath(path)) throw new Error(`Invalid path: ${path}`)
      bytes += file.size
      if (Object.keys(files).length >= PLUGIN_PACKAGE_LIMITS.maxFiles || bytes > PLUGIN_PACKAGE_LIMITS.maxTotalBytes)
        throw new Error('Plugin package exceeds size limits')
      const data = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192))
      files[path] = btoa(binary)
    }
    return files
  })
}
</script>

<style scoped>
.install-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.note {
  color: var(--color-text-subtle);
  font-size: var(--text-sm);
}
.install-status {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
}
.error {
  color: var(--color-danger);
}
.file-button {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-text-strong);
  background: var(--color-surface);
  font-size: var(--text-sm);
  cursor: pointer;
}
.file-button:hover {
  background: var(--color-hover);
}
.file-button:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.file-button input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
}
</style>
