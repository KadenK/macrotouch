#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const PLUGIN_PACKAGE_LIMITS = { maxFiles: 500, maxTotalBytes: 20 * 1024 * 1024 }
async function main() {
  const [, , folder, output] = process.argv
  if (!folder || process.argv.length > 4) throw new Error('Usage: node scripts/pack-plugin.mjs <folder> [out]')
  const root = resolve(folder)
  const files = {}
  let total = 0
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (path.length > 512 || path.includes('\\')) throw new Error(`Invalid path: ${path}`)
      if (entry.isDirectory()) await walk(join(dir, entry.name), path)
      else if (entry.isFile()) {
        if (Object.keys(files).length >= PLUGIN_PACKAGE_LIMITS.maxFiles) throw new Error('Too many files')
        const data = await readFile(join(dir, entry.name))
        total += data.length
        if (total > PLUGIN_PACKAGE_LIMITS.maxTotalBytes) throw new Error('Package exceeds size limit')
        files[path] = data.toString('base64')
      }
    }
  }
  await walk(root)
  if (!files['package.json']) throw new Error('Missing package.json')
  const manifest = JSON.parse(Buffer.from(files['package.json'], 'base64').toString())
  const id = manifest.macrotouch?.id
  const version = manifest.version
  if (
    typeof id !== 'string' ||
    !/^[a-z0-9-]+$/.test(id) ||
    typeof version !== 'string' ||
    !/^[a-zA-Z0-9.+-]+$/.test(version)
  )
    throw new Error('Invalid plugin id or version')
  const out = output || `${id}-${version}.mtplugin.json`
  await writeFile(out, JSON.stringify(files))
  console.log(`Wrote ${out}`)
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
