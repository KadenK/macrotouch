import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const actionsDir = path.resolve(__dirname, '../util/actions')
const indexFile = path.join(actionsDir, 'index.ts')

const filenames = (await readdir(actionsDir))
  .filter((filename) => filename.endsWith('.ts'))
  .filter((filename) => filename !== 'index.ts' && filename !== 'platform.ts')
  .sort()

const actionFiles = []

for (const filename of filenames) {
  const content = await readFile(path.join(actionsDir, filename), 'utf8')
  if (!content.includes('actionId:')) continue
  actionFiles.push(filename)
}

const importLines = actionFiles.map((filename) => {
  const baseName = filename.replace(/\.ts$/, '')
  return `import ${baseName} from './${baseName}'`
})

const arrayItems = actionFiles.map((filename) => filename.replace(/\.ts$/, ''))

const generated = `${importLines.join('\n')}

export const actions = [${arrayItems.join(', ')}] as const

export default actions
`

await writeFile(indexFile, generated)
console.log(`Generated ${path.relative(process.cwd(), indexFile)} from ${actionFiles.length} action files`)
