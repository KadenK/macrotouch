import { useRuntimeConfig } from '#app'
import { usePairingToken, withToken } from './usePairingToken'
import { HTTP_PORT } from '../../shared/websocket'
import {
  IMAGE_LIMITS,
  macroImageOriginalUrl,
  macroImageUrl,
  type Icon,
  type IconImage,
  type MacroSpan,
} from '../../shared/types/macro'

/**
 * Custom macro images, from the editor's side.
 *
 * Files live on the master. The editor uploads one (`POST /api/macro-image`),
 * then asks the master to bake a crop of it for a span (`.../bake`). Remotes
 * only ever load the baked file.
 */

export interface UploadedImage {
  id: string
  ext: string
  width: number
  height: number
  animated: boolean
}

/** Where the master serves HTTP. In dev the UI comes from another port, so this is not always our own origin. */
let cachedOrigin: string | undefined
export function masterOrigin(): string {
  if (cachedOrigin) return cachedOrigin
  if (typeof window === 'undefined') return ''
  let host = ''
  let port: number = HTTP_PORT
  try {
    const config = useRuntimeConfig().public
    host = (config.masterHost as string) || ''
    port = Number(config.masterHttpPort) || HTTP_PORT
  } catch {
    // Outside a Nuxt context (a custom element callback): the defaults.
  }
  return (cachedOrigin = `${window.location.protocol}//${host || window.location.hostname}:${port}`)
}

/** Absolute URL of a baked image, for `<img>`. Open to everyone, so it needs no token. */
export function bakedImageSrc(id: string, image: Pick<IconImage, 'rev' | 'ext'>): string {
  return masterOrigin() + macroImageUrl(id, image.rev, image.ext)
}

/** The src for a macro's custom image, or undefined when its icon is not one. For faces, plugin faces included. */
export function macroImageSrc(icon: Icon | undefined): string | undefined {
  return icon?.source === 'IMAGE' && icon.image ? bakedImageSrc(icon.value, icon.image) : undefined
}

/** Absolute URL of the original, editors only: remotes add their pairing token, the host is exempt. */
export function originalImageSrc(id: string): string {
  const { clientToken } = usePairingToken()
  return withToken(masterOrigin() + macroImageOriginalUrl(id), clientToken.value)
}

/** A friendly message when `file` would be refused anyway, otherwise undefined. */
export function checkImageFile(file: File): string | undefined {
  if (!(IMAGE_LIMITS.mimeTypes as readonly string[]).includes(file.type)) {
    return 'That file type is not supported. Use a PNG, JPEG, WebP, GIF or SVG image.'
  }
  if (file.size > IMAGE_LIMITS.maxBytes) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return `That image is ${mb} MB; the limit is ${IMAGE_LIMITS.maxBytes / 1024 / 1024} MB.`
  }
  return undefined
}

async function failure(response: Response): Promise<Error> {
  let message = ''
  try {
    const text = await response.text()
    try {
      const body = JSON.parse(text)
      message = body?.message ?? body?.error ?? ''
    } catch {
      message = text
    }
  } catch {
    // No readable body.
  }
  if (typeof message !== 'string') message = ''
  const fallback: Record<number, string> = {
    400: 'The image could not be read.',
    401: 'This device is not allowed to upload images.',
    403: 'This device is not allowed to upload images.',
    413: 'That image is too large.',
    415: 'That file type is not supported.',
  }
  return new Error(message.slice(0, 200) || fallback[response.status] || `Upload failed (${response.status}).`)
}

function authHeaders(): Record<string, string> {
  const { clientToken } = usePairingToken()
  return clientToken.value ? { 'x-pairing-token': clientToken.value } : {}
}

/** Upload an image file. Throws an Error with a message fit to show the user. */
export async function uploadMacroImage(file: File): Promise<UploadedImage> {
  const problem = checkImageFile(file)
  if (problem) throw new Error(problem)
  let response: Response
  try {
    response = await fetch(`${masterOrigin()}/api/macro-image`, {
      method: 'POST',
      headers: { 'Content-Type': file.type, ...authHeaders() },
      body: file,
    })
  } catch {
    throw new Error('Could not reach the server to upload the image.')
  }
  if (!response.ok) throw await failure(response)
  return (await response.json()) as UploadedImage
}

/** Bake `crop` of image `id` for `span`; returns what to save on the icon. */
export async function bakeMacroImage(
  id: string,
  span: MacroSpan,
  crop: IconImage['crop'],
  mode: IconImage['mode'],
): Promise<IconImage> {
  let response: Response
  try {
    response = await fetch(`${masterOrigin()}/api/macro-image/${encodeURIComponent(id)}/bake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ span, crop }),
    })
  } catch {
    throw new Error('Could not reach the server to save the image.')
  }
  if (!response.ok) throw await failure(response)
  const baked = (await response.json()) as { rev: string; ext: IconImage['ext'] }
  return { span: { ...span }, crop: { ...crop }, mode, rev: baked.rev, ext: baked.ext }
}

/**
 * The crop frame, in pixels of the original (w x h), for a span.
 *
 * The frame has the aspect of the span (columns / rows). At zoom 1 it is the
 * largest such rectangle that fits inside the image (so it touches the image on
 * one axis, "cover"). At zoom z the visible region is that rectangle / z.
 * `crop.x` / `crop.y` is the centre of the visible region as a fraction of the
 * original's width / height; the centre is clamped so the region stays inside.
 */
export function cropRegion(w: number, h: number, span: MacroSpan, crop: IconImage['crop']) {
  const aspect = span.columns / span.rows
  const baseW = w / h >= aspect ? h * aspect : w
  const baseH = baseW / aspect
  const zoom = Math.max(1, crop.zoom)
  const width = baseW / zoom
  const height = baseH / zoom
  const clamp = (v: number, half: number, total: number) => {
    const lo = half / total
    return Math.min(Math.max(v, lo), 1 - lo)
  }
  return {
    width,
    height,
    x: clamp(crop.x, width / 2, w),
    y: clamp(crop.y, height / 2, h),
    zoom,
  }
}
