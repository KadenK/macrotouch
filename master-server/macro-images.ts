import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { optimize, type CustomPlugin, type PluginConfig } from 'svgo'
import { IMAGE_LIMITS, IconSource, isImageSpan } from '../shared/types/macro'
import type { IconImage, MacroSpan } from '../shared/types/macro'
import type { MacroState } from '../shared/types'
import { BAKED_FILE_RE, IMAGE_ID_RE } from './image-ids'

/**
 * Custom macro images: the master stores what was uploaded, and bakes the
 * small file the remotes actually load.
 *
 *   <dataRoot>/macro-images/originals/<id>.<png|jpg|webp|gif|svg>   as uploaded (SVG: sanitised)
 *   <dataRoot>/macro-images/baked/<id>-<rev>.<webp|svg>             cropped to a macro's shape
 *
 * Packaging: `sharp` is a native module. It is `--external` in `build:master`
 * and ships its binaries as optional per-platform packages (`@img/sharp-*`),
 * which npm installs only for the machine running `npm install`. A cross build
 * (`npm run dist:wine` on Linux) therefore needs the Windows ones added first:
 * `npm i --no-save --os=win32 --cpu=x64 sharp`. `svgo` is pure JS and bundled.
 */

export class ImageError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export type RasterExt = 'png' | 'jpg' | 'webp' | 'gif'
export type OriginalExt = RasterExt | 'svg'
export const ORIGINAL_EXTS: OriginalExt[] = ['png', 'jpg', 'webp', 'gif', 'svg']

export interface IngestResult {
  id: string
  ext: OriginalExt
  width: number
  height: number
  animated: boolean
}
export interface BakeResult {
  rev: string
  ext: 'webp' | 'svg'
}

const ORIGINAL_TYPES: Record<OriginalExt, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}
export const originalContentType = (ext: string) => ORIGINAL_TYPES[ext as OriginalExt] ?? 'application/octet-stream'
export const bakedContentType = (ext: string) => (ext === 'svg' ? 'image/svg+xml' : 'image/webp')

const MAX_ZOOM = 16
const GC_GRACE_MS = 10 * 60 * 1000

/** What the bytes are, from their first bytes. The declared content type and file name are not trusted. */
export function detectFormat(bytes: Buffer): OriginalExt | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP')
    return 'webp'
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.toString('latin1', 0, 6))) return 'gif'
  // SVG is text: optional BOM, then a prolog, comment, doctype or the root itself.
  const head = bytes
    .toString('utf8', 0, 2048)
    .replace(/^\u{FEFF}/u, '')
    .trimStart()
  if (/^(<\?xml|<!--|<!DOCTYPE\s+svg|<svg[\s>])/i.test(head) && /<svg[\s>]/i.test(bytes.toString('utf8', 0, 65536)))
    return 'svg'
  return null
}

/* ------------------------------------------------------------------ SVG */

const FORBIDDEN_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'embed',
  'object',
  'audio',
  'video',
  'canvas',
  'applet',
  'link',
  'meta',
  'base',
])
const DATA_IMAGE = /^\s*data:image\/(png|jpe?g|gif|webp);base64,/i
/** Anything a stylesheet or paint could fetch that is not a fragment of this document or an embedded raster. */
const CSS_REMOTE = /url\(\s*(?!['"]?\s*(?:#|data:image\/(?:png|jpe?g|gif|webp);base64,))[^)]*\)/gi

/** Removes what could run script or reach the network, before svgo optimises the rest. */
const sanitizePlugin: CustomPlugin = {
  name: 'macrotouchSanitize',
  fn: () => ({
    element: {
      enter: (node, parent) => {
        const forbidden = FORBIDDEN_ELEMENTS.has(node.name.toLowerCase())
        const animatesLink =
          (node.name === 'set' || node.name.startsWith('animate')) && /href/i.test(node.attributes.attributeName ?? '')
        if (forbidden || animatesLink) {
          parent.children = parent.children.filter((child) => child !== node)
          return
        }
        for (const [name, value] of Object.entries(node.attributes)) {
          const lower = name.toLowerCase()
          const isLink = lower === 'href' || lower.endsWith(':href')
          if (
            lower.startsWith('on') ||
            (isLink && !value.trimStart().startsWith('#') && !DATA_IMAGE.test(value)) ||
            /^\s*(javascript|vbscript):/i.test(value)
          ) {
            Reflect.deleteProperty(node.attributes, name)
          } else if (value.includes('url(')) {
            node.attributes[name] = value.replace(CSS_REMOTE, 'none')
          }
        }
      },
    },
    text: {
      enter: (node, parent) => {
        if (parent.type === 'element' && parent.name.toLowerCase() === 'style') {
          node.value = node.value.replace(/@import[^;]*;?/gi, '').replace(CSS_REMOTE, 'none')
        }
      },
    },
    cdata: {
      enter: (node, parent) => {
        if (parent.type === 'element' && parent.name.toLowerCase() === 'style') {
          node.value = node.value.replace(/@import[^;]*;?/gi, '').replace(CSS_REMOTE, 'none')
        }
      },
    },
  }),
}

const rootTag = (svg: string) => /<svg(?=[\s>/])[^>]*>/i.exec(svg)

const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
    .exec(tag)
    ?.slice(2, 4)
    .find((v) => v !== undefined)

const length = (v: string | undefined) => {
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(px|pt|em|mm|cm|in)?\s*$/i.exec(v ?? '')
  return m && Number(m[1]) > 0 ? Number(m[1]) : undefined
}

/** The viewBox of an SVG's root, from the attribute or, failing that, its width and height. */
function viewBoxOf(tag: string): [number, number, number, number] | undefined {
  const parts = attr(tag, 'viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  if (parts?.length === 4 && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0)
    return parts as [number, number, number, number]
  const w = length(attr(tag, 'width'))
  const h = length(attr(tag, 'height'))
  return w && h ? [0, 0, w, h] : undefined
}

/** Cleans an SVG and makes sure it carries a viewBox. Throws ImageError if it cannot be a safe image. */
function sanitizeSvg(bytes: Buffer): {
  svg: string
  width: number
  height: number
} {
  let svg: string
  try {
    svg = optimize(bytes.toString('utf8'), {
      plugins: [
        sanitizePlugin,
        'removeScripts',
        'removeDoctype',
        'removeXMLProcInst',
        'removeComments',
        'removeMetadata',
        'removeEditorsNSData',
        {
          name: 'preset-default',
          params: { overrides: { removeViewBox: false } },
        } as PluginConfig,
      ],
    }).data
  } catch (err) {
    throw new ImageError(400, `Not a valid SVG: ${(err as Error).message}`)
  }

  const tag = rootTag(svg)
  if (!tag || svg.slice(0, tag.index).trim() !== '') throw new ImageError(400, 'Not an SVG image')
  // Belt and braces: svgo ran above, but this is the check that matters for what gets served.
  if (/<\s*(script|foreignObject|iframe|embed|object)\b|\son[a-z]+\s*=|javascript:/i.test(svg))
    throw new ImageError(400, 'SVG contains scripting that could not be removed')

  const box = viewBoxOf(tag[0])
  if (!box) throw new ImageError(400, 'SVG has no viewBox or width and height')
  let out = svg
  if (!attr(tag[0], 'viewBox')) {
    out =
      svg.slice(0, tag.index) +
      tag[0].replace(/<svg/i, `<svg viewBox="0 0 ${box[2]} ${box[3]}"`) +
      svg.slice(tag.index + tag[0].length)
  }
  return { svg: out, width: Math.round(box[2]), height: Math.round(box[3]) }
}

/* ----------------------------------------------------------------- crop */

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function checkSpan(span: unknown): MacroSpan {
  if (!isImageSpan(span)) throw new ImageError(400, 'span must be whole rows and columns of at least 1')
  return { rows: span.rows, columns: span.columns }
}

function checkCrop(crop: unknown): IconImage['crop'] {
  const c = crop as Partial<IconImage['crop']> | undefined
  if (!c || ![c.x, c.y, c.zoom].every((n) => typeof n === 'number' && Number.isFinite(n)))
    throw new ImageError(400, 'crop needs finite x, y and zoom')
  return {
    x: clamp(c.x!, 0, 1),
    y: clamp(c.y!, 0, 1),
    zoom: clamp(c.zoom!, 1, MAX_ZOOM),
  }
}

/** The crop frame in the original's own units: the largest frame of the span's aspect that fits, divided by zoom, kept inside the image. */
function frameOf(width: number, height: number, span: MacroSpan, crop: IconImage['crop']) {
  const aspect = span.columns / span.rows
  const fit = width / height > aspect ? { w: height * aspect, h: height } : { w: width, h: width / aspect }
  const w = fit.w / crop.zoom
  const h = fit.h / crop.zoom
  return {
    left: clamp(crop.x * width - w / 2, 0, width - w),
    top: clamp(crop.y * height - h / 2, 0, height - h),
    width: w,
    height: h,
  }
}

const shortHash = (data: Buffer | string) => crypto.createHash('sha256').update(data).digest('hex').slice(0, 12)

/* ---------------------------------------------------------------- store */

export class MacroImages {
  readonly originalsDir: string
  readonly bakedDir: string

  constructor(
    dataRoot: string,
    private readonly graceMs = GC_GRACE_MS,
  ) {
    const base = path.join(dataRoot, 'macro-images')
    this.originalsDir = path.join(base, 'originals')
    this.bakedDir = path.join(base, 'baked')
    for (const dir of [this.originalsDir, this.bakedDir]) {
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch (err) {
        console.error('[Images] cannot create', dir, err)
      }
    }
  }

  async ingest(bytes: Buffer, contentType?: string): Promise<IngestResult> {
    if (bytes.length === 0) throw new ImageError(400, 'Empty upload')
    if (bytes.length > IMAGE_LIMITS.maxBytes) throw new ImageError(413, 'Image is too large')
    const declared = contentType?.split(';')[0]?.trim().toLowerCase()
    if (declared && !(IMAGE_LIMITS.mimeTypes as readonly string[]).includes(declared))
      throw new ImageError(415, `Unsupported content type ${declared}`)
    const ext = detectFormat(bytes)
    if (!ext) throw new ImageError(415, 'Not a PNG, JPEG, WebP, GIF or SVG image')

    let stored = bytes
    let width: number
    let height: number
    let animated = false
    if (ext === 'svg') {
      const clean = sanitizeSvg(bytes)
      stored = Buffer.from(clean.svg, 'utf8')
      width = clean.width
      height = clean.height
    } else {
      try {
        const meta = await sharp(bytes, {
          limitInputPixels: IMAGE_LIMITS.maxPixels,
          animated: true,
        }).metadata()
        const frames = meta.pages ?? 1
        width = meta.width ?? 0
        height = meta.pageHeight ?? meta.height ?? 0
        if (!width || !height) throw new Error('no dimensions')
        if (frames > IMAGE_LIMITS.maxFrames)
          throw new ImageError(413, `Animation has more than ${IMAGE_LIMITS.maxFrames} frames`)
        if (width * height * frames > IMAGE_LIMITS.maxPixels) throw new ImageError(413, 'Image has too many pixels')
        // EXIF orientation 5-8 turns the picture on its side; report it as it will look.
        if ((meta.orientation ?? 1) >= 5) [width, height] = [height, width]
        animated = frames > 1
      } catch (err) {
        if (err instanceof ImageError) throw err
        throw new ImageError(400, 'Image could not be read')
      }
    }

    const id = crypto.randomUUID()
    await this.writeAtomic(path.join(this.originalsDir, `${id}.${ext}`), stored)
    return { id, ext, width, height, animated }
  }

  async bake(id: string, options: { span: unknown; crop: unknown }): Promise<BakeResult> {
    const span = checkSpan(options.span)
    const crop = checkCrop(options.crop)
    const found = this.findOriginal(id)
    if (!found) throw new ImageError(404, 'No such image')
    const source = await fs.promises.readFile(found.file)

    let out: Buffer
    let ext: 'webp' | 'svg'
    if (found.ext === 'svg') {
      ext = 'svg'
      out = Buffer.from(this.bakeSvg(source.toString('utf8'), span, crop), 'utf8')
    } else {
      ext = 'webp'
      out = await this.bakeRaster(source, span, crop)
    }

    const rev = shortHash(out)
    const file = path.join(this.bakedDir, `${id}-${rev}.${ext}`)
    // Same bytes, same name: a repeat bake is a no-op but refreshes the mtime so it survives a gc.
    if (fs.existsSync(file)) await fs.promises.utimes(file, new Date(), new Date())
    else await this.writeAtomic(file, out)
    return { rev, ext }
  }

  private bakeSvg(svg: string, span: MacroSpan, crop: IconImage['crop']): string {
    const tag = rootTag(svg)
    const box = tag && viewBoxOf(tag[0])
    if (!tag || !box) throw new ImageError(400, 'Stored SVG has no viewBox')
    const f = frameOf(box[2], box[3], span, crop)
    const r = (n: number) => Number(n.toFixed(4))
    const viewBox = `${r(box[0] + f.left)} ${r(box[1] + f.top)} ${r(f.width)} ${r(f.height)}`
    const rewritten = tag[0]
      .replace(/\s(?:viewBox|width|height|preserveAspectRatio)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
      .replace(/<svg/i, `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice"`)
    return svg.slice(0, tag.index) + rewritten + svg.slice(tag.index + tag[0].length)
  }

  private async bakeRaster(source: Buffer, span: MacroSpan, crop: IconImage['crop']): Promise<Buffer> {
    try {
      const limit = { limitInputPixels: IMAGE_LIMITS.maxPixels }
      let input = source
      const probe = await sharp(source, {
        ...limit,
        animated: true,
      }).metadata()
      const frames = probe.pages ?? 1
      if ((probe.orientation ?? 1) > 1 && frames === 1) input = await sharp(source, limit).rotate().toBuffer()
      const meta = input === source ? probe : await sharp(input, limit).metadata()
      const width = meta.width!
      const height = meta.pageHeight ?? meta.height!

      const f = frameOf(width, height, span, crop)
      // The output has exactly the span's aspect, so there is no rounding drift between frame and macro.
      const unit = Math.max(
        1,
        Math.floor(Math.min(IMAGE_LIMITS.maxEdge, Math.max(f.width, f.height)) / Math.max(span.columns, span.rows)),
      )
      const outW = unit * span.columns
      const outH = unit * span.rows

      const extractW = clamp(Math.round(f.width), 1, width)
      const extractH = clamp(Math.round(f.height), 1, height)
      const region = {
        left: clamp(Math.round(f.left), 0, width - extractW),
        top: clamp(Math.round(f.top), 0, height - extractH),
        width: extractW,
        height: extractH,
      }

      if (frames === 1) {
        return await sharp(input, limit)
          .extract(region)
          .resize(outW, outH, { fit: 'fill' })
          .webp({ quality: 85, alphaQuality: 100 })
          .toBuffer()
      }

      // Animated: crop and resize every frame separately, then put them back together.
      const delays = meta.delay ?? []
      const buffers: Buffer[] = []
      for (let page = 0; page < frames; page++) {
        buffers.push(
          await sharp(input, { ...limit, page })
            .ensureAlpha()
            .extract(region)
            .resize(outW, outH, { fit: 'fill' })
            .raw()
            .toBuffer(),
        )
      }
      return await sharp(Buffer.concat(buffers), {
        raw: {
          width: outW,
          height: outH * frames,
          channels: 4,
          pageHeight: outH,
        },
      })
        .webp({
          quality: 80,
          alphaQuality: 100,
          loop: meta.loop ?? 0,
          delay: delays,
        })
        .toBuffer()
    } catch (err) {
      if (err instanceof ImageError) throw err
      console.error('[Images] bake failed:', err)
      throw new ImageError(422, 'Image could not be processed')
    }
  }

  findOriginal(id: string): { file: string; ext: OriginalExt } | undefined {
    if (!IMAGE_ID_RE.test(id)) return undefined
    for (const ext of ORIGINAL_EXTS) {
      const file = path.join(this.originalsDir, `${id}.${ext}`)
      if (fs.existsSync(file)) return { file, ext }
    }
    return undefined
  }

  bakedFile(id: string, rev: string, ext: string): string {
    return path.join(this.bakedDir, `${id}-${rev}.${ext}`)
  }

  private async writeAtomic(file: string, data: Buffer) {
    const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`
    await fs.promises.writeFile(tmp, data)
    await fs.promises.rename(tmp, file)
  }

  /**
   * Deletes images no macro uses. Anything touched in the last grace period is kept,
   * so an upload not yet saved into a macro, or an undone edit, still has its files.
   * With `referencedBakes` (`<id>-<rev>` names), a used image's older bakes go too.
   */
  async gc(referencedIds: Set<string>, referencedBakes?: Set<string>): Promise<number> {
    const cutoff = Date.now() - this.graceMs
    let removed = 0
    const sweep = async (dir: string, keep: (name: string) => boolean) => {
      let names: string[]
      try {
        names = await fs.promises.readdir(dir)
      } catch {
        return
      }
      for (const name of names) {
        const file = path.join(dir, name)
        try {
          if (keep(name)) continue
          const stat = await fs.promises.stat(file)
          if (!stat.isFile() || stat.mtimeMs > cutoff) continue
          await fs.promises.unlink(file)
          removed++
        } catch {
          // Gone already, or busy on Windows: the next run gets it.
        }
      }
    }
    await sweep(this.originalsDir, (name) => {
      const m = /^([0-9a-f-]{36})\.(png|jpg|webp|gif|svg)$/.exec(name)
      return !!m && referencedIds.has(m[1]!)
    })
    await sweep(this.bakedDir, (name) => {
      const m = BAKED_FILE_RE.exec(name)
      if (!m || !referencedIds.has(m[1]!)) return false
      return !referencedBakes || referencedBakes.has(`${m[1]}-${m[2]}`)
    })
    if (removed) console.log(`[Images] removed ${removed} unused image file(s)`)
    return removed
  }
}

/** The images the state uses: on each macro's icon and on its `stateAppearance` icons. */
export function collectImageRefs(state: MacroState): {
  ids: Set<string>
  bakes: Set<string>
} {
  const ids = new Set<string>()
  const bakes = new Set<string>()
  const add = (icon?: { source?: unknown; value?: unknown; image?: { rev?: unknown } }) => {
    if (icon?.source !== IconSource.Image || typeof icon.value !== 'string') return
    ids.add(icon.value)
    if (typeof icon.image?.rev === 'string') bakes.add(`${icon.value}-${icon.image.rev}`)
  }
  for (const macro of Object.values(state.macros ?? {})) {
    add(macro.icon)
    for (const appearance of Object.values(macro.stateAppearance ?? {})) add(appearance?.icon)
  }
  return { ids, bakes }
}
