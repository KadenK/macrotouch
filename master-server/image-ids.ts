/** Shapes of the names a custom image is stored and served under. Shared by validation, storage and HTTP. */
export const IMAGE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const IMAGE_REV_RE = /^[0-9a-f]{8,64}$/
export const BAKED_EXTS = ['webp', 'svg'] as const
export const BAKED_FILE_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{8,64})\.(webp|svg)$/
