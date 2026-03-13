export class Color {
  r: number
  g: number
  b: number

  constructor(r: number, g: number, b: number) {
    this.r = r
    this.g = g
    this.b = b
  }

  toHex(): string {
    const toHex = (value: number) => value.toString(16).padStart(2, '0')
    return `#${toHex(this.r)}${toHex(this.g)}${toHex(this.b)}`
  }

  static fromHex(hex: string): Color {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return new Color(r, g, b)
  }
}
