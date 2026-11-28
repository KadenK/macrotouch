import { uuid } from '../uuid'
import type { Color } from './common'
import { createColor } from './common'
import type { ActionAppearance } from './actionState'
import type { ActionStateKind } from './action'
import type { NodeId } from './node'

export enum IconSource {
  Library = 'LIBRARY',
  /** A user-uploaded image; `Icon.value` is the image id and `Icon.image` holds how it is shown. */
  Image = 'IMAGE',
}

/** How a custom image is placed on a macro. Saved on `Icon.image`. */
export interface IconImage {
  /** The macro's shape when the image was cropped; the crop frame has this aspect. The macro's own span. */
  span: MacroSpan
  /** Crop of the original within the frame: `x`/`y` is the frame centre in 0..1 of the original, `zoom` >= 1 (1 = frame covers the image's shorter fit). */
  crop: { x: number; y: number; zoom: number }
  /** `inset`: drawn like an icon, background around it. `fill`: covers the whole button, clipped to its corners. */
  mode: 'inset' | 'fill'
  /** Content hash of the baked file the remotes load; changes whenever the crop or span does. */
  rev: string
  /** File extension of the baked file: `webp` (raster and animated) or `svg`. */
  ext: 'webp' | 'svg'
}

/** Whether `span` is a whole-number macro shape the image routes accept (any real macro span). */
export function isImageSpan(span: unknown): span is MacroSpan {
  const s = span as Partial<MacroSpan> | null | undefined
  const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 64
  return !!s && ok(s.rows) && ok(s.columns)
}

/** Upload limits, enforced by the master and checked early by the editor. */
export const IMAGE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxPixels: 40_000_000,
  /** Longest edge of a baked raster image. */
  maxEdge: 512,
  maxFrames: 200,
  mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
} as const

/** URL (path) of an image file served by the master. Originals are for editors only (token-gated). */
export const macroImageUrl = (id: string, rev: string, ext: string) => `/macro-images/baked/${id}-${rev}.${ext}`
export const macroImageOriginalUrl = (id: string) => `/macro-images/originals/${id}`

export interface Icon {
  source: IconSource
  value: string
  /** Present when `source` is `Image`. */
  image?: IconImage
}

/** How many grid cells a macro covers, from its top-left cell. */
export interface MacroSpan {
  rows: number
  columns: number
}

export interface Macro {
  id: string
  name: string
  actionId?: string
  icon: Icon
  iconColor: Color
  backgroundColor: Color
  parameters?: Record<string, any>
  /**
   * How the macro looks for each live value of a stateful action, keyed by
   * `String(value)` (`'true'`, `'false'`). Fields left out fall back to the
   * macro's own.
   */
  stateAppearance?: Record<string, ActionAppearance>
  /**
   * The kind of live state the macro's action reports, which picks the standard face
   * a screen draws it with. Saved by the editor, since the remote has no
   * catalog to look it up in. Absent for a plain button.
   */
  stateKind?: ActionStateKind
  /**
   * The cells the macro covers. Absent means one cell. The macro's id sits in
   * its top-left cell of `macroRows`; the other cells it covers hold ''. The
   * master owns this field: an upsert never changes it, only `resize-macro`.
   */
  span?: MacroSpan
  /** The action server that runs the action. Absent: the local one (the one the master launched). */
  nodeId?: NodeId
  /**
   * The face the macro is drawn with, as its action names it (`core/value`,
   * `<pluginId>/<faceId>`). Absent: the standard face for `stateKind`. A plugin
   * face that is not loaded falls back to that too.
   */
  face?: string
  /**
   * Face settings that have no field of their own above (`icon`, the colors,
   * `stateAppearance`), keyed by section id: `text`, or a plugin's section.
   */
  faceSettings?: Record<string, unknown>
}

export function createMacro(name = 'New Macro'): Macro {
  return {
    id: uuid(),
    name,
    actionId: undefined,
    icon: { source: IconSource.Library, value: 'ic:baseline-home' },
    iconColor: createColor(0, 0, 0),
    backgroundColor: createColor(255, 255, 255),
  }
}
