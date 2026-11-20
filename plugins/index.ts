import keyboardPkg from './core-keyboard/package.json'
import keyboard from './core-keyboard'
import systemPkg from './core-system/package.json'
import system from './core-system'
import mediaPkg from './core-media/package.json'
import media from './core-media'
import type { PluginModule } from '../plugin-sdk'

/**
 * Built-in plugins, bundled into the action server.
 *
 * Each lives in `plugins/<id>/` as a `package.json` (with a `macrotouch`
 * manifest) and an `index.ts` whose default export is a {@link PluginModule}.
 * The action server's PluginHost loads these exactly like installed plugins;
 * only where the code comes from differs (a static import here, `import()` of
 * `server.mjs` for installed ones).
 */
export interface BuiltinPlugin {
  /** The plugin's parsed `package.json` (`name`, `version`, `macrotouch`). */
  pkg: { name: string; version: string; macrotouch: Record<string, unknown> }
  module: PluginModule
}

export const builtinPlugins: BuiltinPlugin[] = [
  { pkg: keyboardPkg, module: keyboard },
  { pkg: systemPkg, module: system },
  { pkg: mediaPkg, module: media },
]
