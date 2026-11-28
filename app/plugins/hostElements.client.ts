import { getIconData, iconToHTML, iconToSVG } from '@iconify/utils'
import { icons as ic } from '@iconify-json/ic'
import { icons as simpleIcons } from '@iconify-json/simple-icons'
import { icons as gameIcons } from '@iconify-json/game-icons'
import { icons as materialSymbols } from '@iconify-json/material-symbols'
import { icons as codicon } from '@iconify-json/codicon'
import { icons as fileIcons } from '@iconify-json/file-icons'
import { colorToHex, type Macro } from '~/../shared/types'
import { useMacroStore } from '~/stores/macro'
import { setPluginFaces } from '~/composables/useMacroFace'
import { macroImageSrc } from '~/composables/useMacroImage'

const collections: Record<string, typeof ic> = {
  ic,
  'simple-icons': simpleIcons,
  'game-icons': gameIcons,
  'material-symbols': materialSymbols,
  codicon,
  'file-icons': fileIcons,
}
const customIcons = import.meta.glob('~/assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
class HostIcon extends HTMLElement {
  static observedAttributes = ['name']
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }
  get name() {
    return this.getAttribute('name') ?? ''
  }
  set name(value: string) {
    this.setAttribute('name', value ?? '')
  }
  connectedCallback() {
    this.render()
  }
  attributeChangedCallback() {
    this.render()
  }
  render() {
    const [prefix, name] = (this.name.includes(':') ? this.name : `ic:${this.name}`).split(':')
    const icon = prefix && name && collections[prefix] ? getIconData(collections[prefix], name) : null
    const custom =
      prefix === 'mt' ? Object.entries(customIcons).find(([path]) => path.endsWith(`/${name}.svg`))?.[1] : undefined
    const svg = icon ? iconToSVG(icon, {}) : undefined
    this.shadowRoot!.innerHTML = `<style>:host{display:inline-block;width:1em;height:1em}svg{width:100%;height:100%;display:block}</style>${svg ? iconToHTML(svg.body, svg.attributes) : (custom ?? '')}`
  }
}
class HostMacroFace extends HTMLElement {
  private current?: Macro
  private labels = false
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }
  get macro() {
    return this.current
  }
  set macro(value: Macro | undefined) {
    this.current = value
    this.render()
  }
  get showLabel() {
    return this.labels
  }
  set showLabel(value: boolean) {
    this.labels = value
    this.render()
  }
  connectedCallback() {
    this.render()
  }
  render() {
    const root = this.shadowRoot!
    root.innerHTML =
      '<style>:host{display:block;width:100%;height:100%;position:relative}.face{overflow:hidden;position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:8px}mt-icon{width:75%;height:75%;min-width:50px;aspect-ratio:1}.label{position:absolute;right:0;bottom:0;left:0;padding:0 .5rem .4rem;font-size:.75rem;line-height:1.2;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style>'
    if (!this.current) return
    const face = document.createElement('div')
    face.className = 'face'
    face.style.backgroundColor = colorToHex(this.current.backgroundColor)
    face.style.color = colorToHex(this.current.iconColor)
    const icon = document.createElement('mt-icon')
    icon.setAttribute('name', this.current.icon.source === 'LIBRARY' ? this.current.icon.value : '')
    const imageSrc = macroImageSrc(this.current.icon)
    if (imageSrc) {
      const img = document.createElement('img')
      img.src = imageSrc
      img.draggable = false
      const fill = this.current.icon.image?.mode === 'fill'
      img.style.cssText = fill
        ? 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none'
        : 'width:75%;height:75%;object-fit:contain;border-radius:8px;pointer-events:none'
      face.append(img)
    } else face.append(icon)
    root.append(face)
    if (this.labels) {
      const label = document.createElement('span')
      label.className = 'label'
      label.style.color = colorToHex(this.current.iconColor)
      label.textContent = this.current.name
      root.append(label)
    }
  }
}

export default defineNuxtPlugin(() => {
  if (!customElements.get('mt-icon')) customElements.define('mt-icon', HostIcon)
  if (!customElements.get('mt-macro-face')) customElements.define('mt-macro-face', HostMacroFace)
  const store = useMacroStore()
  const imports = new Map<string, Promise<boolean>>()
  let generation = 0
  /** The `uiUrl` imported for each plugin id. */
  const loadedUrl = new Map<string, string>()
  watch(
    () => store.plugins,
    async (plugins) => {
      const current = ++generation
      const eligible = Object.values(plugins).filter((p) => p.enabled && p.uiUrl && p.faces?.length)
      // A custom element tag can't be redefined, so new face code for an
      // already-loaded plugin only takes effect after a reload.
      if (eligible.some((p) => loadedUrl.has(p.id) && loadedUrl.get(p.id) !== p.uiUrl)) {
        window.location.reload()
        return
      }
      for (const p of eligible) loadedUrl.set(p.id, p.uiUrl!)
      const loaded = await Promise.all(
        eligible.map(async (plugin) => {
          // The master serves plugin files; in dev the app itself comes from another server.
          const { masterHost, masterHttpPort } = useRuntimeConfig().public
          const url = new URL(
            plugin.uiUrl!,
            `${window.location.protocol}//${masterHost || window.location.hostname}:${masterHttpPort}`,
          ).href
          if (!imports.has(url))
            imports.set(
              url,
              import(/* @vite-ignore */ url)
                .then(() => true)
                .catch((error) => {
                  console.warn(`[faces] Failed to load ${url}`, error)
                  return false
                }),
            )
          return (await imports.get(url)) ? plugin : undefined
        }),
      )
      if (current === generation) setPluginFaces(loaded.filter((p) => p !== undefined))
    },
    { deep: true, immediate: true },
  )
})
