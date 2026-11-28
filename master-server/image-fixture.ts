// An isolated HTTP server for the macro image checks: its own data directory, port and token.
import { startHttpServer } from './http'
import { MacroImages } from './macro-images'
import { PairingToken } from './pairing'
import { PluginRegistry } from './plugin-registry'

const dataRoot = process.env.MACROTOUCH_DATA_DIR!
const images = new MacroImages(dataRoot, Number(process.env.IMAGE_GC_GRACE_MS ?? 0))

// `MODE=gc`: run the cleanup once over what is in the data directory, report what is left and exit.
if (process.env.MODE === 'gc') {
  const ids = new Set(process.env.KEEP_IDS?.split(',').filter(Boolean))
  const bakes = new Set(process.env.KEEP_BAKES?.split(',').filter(Boolean))
  await images.gc(ids, bakes)
  const { readdirSync } = await import('node:fs')
  console.log(JSON.stringify({ originals: readdirSync(images.originalsDir), baked: readdirSync(images.bakedDir) }))
  process.exit(0)
}
startHttpServer(
  Number(process.env.MACROTOUCH_HTTP_PORT),
  process.env.MACROTOUCH_STATIC_DIR!,
  new PairingToken(dataRoot),
  new PluginRegistry(dataRoot),
  images,
)
