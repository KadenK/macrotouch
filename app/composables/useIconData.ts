import { ref } from 'vue'
import { icons as icData } from '@iconify-json/ic'
import { icons as simpleIconsData } from '@iconify-json/simple-icons'
import { icons as gameIconsData } from '@iconify-json/game-icons'
import { icons as materialSymbolsData } from '@iconify-json/material-symbols'
import { icons as codiconData } from '@iconify-json/codicon'
import { icons as fileIconsData } from '@iconify-json/file-icons'

const icons = ref<string[]>([])
const isLoaded = ref(false)

const iconLibrarySources = [
  { prefix: 'ic', data: icData },
  { prefix: 'simple-icons', data: simpleIconsData },
  { prefix: 'game-icons', data: gameIconsData },
  { prefix: 'material-symbols', data: materialSymbolsData },
  { prefix: 'codicon', data: codiconData },
  { prefix: 'file-icons', data: fileIconsData },
]

export const normalizeIconValue = (value: string) => {
  return value.includes(':') ? value : `ic:${value}`
}

export const useIconData = () => {
  const loadIcons = () => {
    if (isLoaded.value) return

    const iconList: string[] = []

    iconLibrarySources.forEach((source) => {
      Object.keys(source.data.icons).forEach((iconName) => {
        iconList.push(`${source.prefix}:${iconName}`)
      })
    })

    icons.value = iconList
    isLoaded.value = true
  }

  const searchIcons = (query: string) => {
    if (!query.trim()) return icons.value

    const lowerQuery = query.toLowerCase()
    return icons.value.filter((iconName) => iconName.toLowerCase().includes(lowerQuery))
  }

  return {
    icons,
    isLoaded,
    loadIcons,
    searchIcons,
  }
}
