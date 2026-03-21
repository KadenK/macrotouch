export interface Color {
  r: number
  g: number
  b: number
}

export function createColor(r: number, g: number, b: number): Color {
  return { r, g, b }
}

export function colorToHex(color: Color): string {
  const toHex = (value: number) => value.toString(16).padStart(2, '0')
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

export function colorFromHex(hex: string): Color {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return createColor(r, g, b)
}

export function getContrastColor(color: Color): string {
  const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}
