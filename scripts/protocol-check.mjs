#!/usr/bin/env node
/**
 * Protocol harness for the MAC-40 wire format (hello/snapshot, command/state-patch).
 *
 * Covers the behavior that no browser can reach: handshake ordering, version
 * mismatch, error replies, patch deltas, tombstones, the SY-06 concurrent
 * edit that is the point of the ticket, and the MAC-31 pairing gate. Speaks the
 * protocol directly over `ws`, which the app already depends on, so there is
 * nothing extra to install.
 *
 * The pairing checks need two things the harness cannot invent: `HTTP_URL` (to
 * find a non-loopback address of the master, since a loopback client is exempt
 * from the gate by design) and `MACROTOUCH_DATA_DIR` (to read the token being
 * enforced). Without them those checks skip rather than pass.
 *
 * Run against a server started with an isolated data directory:
 *
 *   MACROTOUCH_DATA_DIR=/tmp/mt-test npm run build:master && npm run start:master
 *   MACROTOUCH_DATA_DIR=/tmp/mt-test node scripts/protocol-check.mjs
 *
 * Exits non-zero if any check fails.
 */

import { WebSocket } from 'ws'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import http from 'node:http'
import sharp from 'sharp'

const WS_URL = process.env.WS_URL ?? 'ws://127.0.0.1:4322'
const HTTP_URL = process.env.HTTP_URL ?? 'http://127.0.0.1:4321'
const PROTOCOL_VERSION = 2
const TIMEOUT = 2000

/**
 * The harness cannot ask the server where it writes, so it will not guess.
 * Without an explicit MACROTOUCH_DATA_DIR the file-level checks would read
 * whatever happens to sit in ~/.macroTouch — a different file than the server
 * under test is writing, which can pass for the wrong reason.
 */
const DATA_DIR = process.env.MACROTOUCH_DATA_DIR ?? null
const STATE_FILE = DATA_DIR ? path.join(DATA_DIR, 'state.json') : null
const TOKEN_FILE = DATA_DIR ? path.join(DATA_DIR, 'pairing.json') : null

/**
 * The pairing token the server under test is enforcing (MAC-31).
 *
 * Read from disk rather than from a snapshot: a snapshot only carries it for a
 * local editor, and the checks below need it before they have one.
 */
function readToken() {
  if (!TOKEN_FILE) return null
  try {
    const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')).token
    return typeof token === 'string' && token ? token : null
  } catch {
    return null
  }
}

/**
 * A websocket URL for this master that is *not* loopback, so the pairing gate
 * applies. The master's own `/api/ip` is the authority on what those are.
 */
async function remoteWsUrl() {
  try {
    const res = await fetch(`${HTTP_URL}/api/ip`)
    const [first] = await res.json()
    if (!first?.ip) return null
    return WS_URL.replace(/\/\/[^:/]+/, `//${first.ip}`)
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ client */

/**
 * One connection, with a message buffer. `next()` resolves from the buffer if
 * the message already arrived, otherwise waits for it — so a check never races
 * the server.
 */
function open(url = WS_URL) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const buffered = []
    const waiters = []
    let closed = false
    let onClose

    const closePromise = new Promise((res) => {
      onClose = res
    })

    const client = {
      ws,
      get closed() {
        return closed
      },
      send: (msg) => ws.send(JSON.stringify(msg)),
      raw: (text) => ws.send(text),
      close: () => ws.close(),

      /** First message matching `predicate`, from the buffer or the wire. */
      next(predicate = () => true, ms = TIMEOUT) {
        const i = buffered.findIndex(predicate)
        if (i !== -1) return Promise.resolve(buffered.splice(i, 1)[0])

        return new Promise((res, rej) => {
          const waiter = { predicate, res }
          waiter.timer = setTimeout(() => {
            const at = waiters.indexOf(waiter)
            if (at !== -1) waiters.splice(at, 1)
            rej(new Error(`timed out after ${ms}ms waiting for a message`))
          }, ms)
          waiters.push(waiter)
        })
      },

      /** Everything received during `ms`. Used to assert silence. */
      async quiet(ms = 300) {
        await new Promise((res) => setTimeout(res, ms))
        return buffered.slice()
      },

      waitClose(ms = TIMEOUT) {
        if (closed) return Promise.resolve()
        return Promise.race([
          closePromise,
          new Promise((_, rej) => setTimeout(() => rej(new Error('socket did not close')), ms)),
        ])
      },
    }

    ws.on('message', (data) => {
      let msg
      try {
        msg = JSON.parse(data.toString())
      } catch {
        msg = { type: '<non-json>', raw: data.toString() }
      }
      const i = waiters.findIndex((w) => w.predicate(msg))
      if (i === -1) {
        buffered.push(msg)
        return
      }
      const waiter = waiters.splice(i, 1)[0]
      clearTimeout(waiter.timer)
      waiter.res(msg)
    })

    ws.on('close', () => {
      closed = true
      onClose()
    })
    ws.on('open', () => resolve(client))
    ws.on('error', (err) => reject(err))
  })
}

const sockets = []
async function connect(url = WS_URL) {
  const c = await open(url)
  sockets.push(c)
  return c
}

/** A connection that has completed the handshake, plus the snapshot it got. */
async function connected(role = 'editor') {
  const c = await connect()
  c.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role })
  const snapshot = await c.next((m) => m.type === 'snapshot')
  return { c, snapshot }
}

/* ----------------------------------------------------------------- harness */

const results = []
let group = ''

function section(name) {
  group = name
  console.log(`\n${name}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function skip(name, why) {
  results.push({ group, name, ok: true, skipped: true })
  console.log(`  skip  ${name}`)
  console.log(`        ${why}`)
}

async function check(name, fn) {
  try {
    await fn()
    results.push({ group, name, ok: true })
    console.log(`  ok    ${name}`)
  } catch (err) {
    results.push({ group, name, ok: false, error: err.message })
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
  }
}

/* ---------------------------------------------------------------- fixtures */

const uid = (label) => `${label}-${Math.random().toString(36).slice(2, 10)}`

const makeMacro = (name = 'Harness Macro', id = uid('macro')) => ({
  id,
  name,
  icon: { source: 'LIBRARY', value: 'ic:baseline-home' },
  iconColor: { r: 0, g: 0, b: 0 },
  backgroundColor: { r: 255, g: 255, b: 255 },
})

const makeScreen = (rows = 2, columns = 3, id = uid('screen')) => ({
  id,
  name: 'Harness Screen',
  size: { rows, columns },
  backgroundColor: { r: 240, g: 240, b: 240 },
  macroRows: Array.from({ length: rows }, () => ({ macrosIds: Array(columns).fill('') })),
})

const isPatch = (m) => m.type === 'state-patch'
const isError = (m) => m.type === 'error'

/* ------------------------------------------------------------------- suite */

async function main() {
  console.log(`protocol-check → ${WS_URL}`)

  // Taken before this run sends a single command, so the ST-02 check below
  // sees the master's own defaults rather than anything a command wrote.
  // Only meaningful against a data directory with no state.json yet.
  const startedFresh = !!STATE_FILE && !fs.existsSync(STATE_FILE)
  const { snapshot: firstSnapshot } = await connected()

  if (!DATA_DIR) {
    console.log('data dir       → not set, persistence checks will be skipped')
  } else {
    console.log(`data dir       → ${DATA_DIR}`)
    console.log(`fresh data dir → ${startedFresh ? 'yes' : 'no, ST-02 will be skipped'}`)
  }

  /* -- handshake ---------------------------------------------------------- */
  section('Handshake')

  await check('no snapshot is sent before hello', async () => {
    const c = await connect()
    const seen = await c.quiet(400)
    assert(seen.length === 0, `expected silence, got ${JSON.stringify(seen)}`)
  })

  await check('a command before hello is rejected', async () => {
    const c = await connect()
    c.send({ type: 'upsert-macro', macro: makeMacro() })
    const msg = await c.next(isError)
    assert(msg.error.code === 'invalid-message', `expected invalid-message, got ${msg.error.code}`)
    assert(/hello/i.test(msg.error.message), `expected the message to name hello, got "${msg.error.message}"`)
  })

  await check('hello is answered with a snapshot carrying state', async () => {
    const { snapshot } = await connected('editor')
    assert(snapshot.protocolVersion === PROTOCOL_VERSION, `wrong protocolVersion: ${snapshot.protocolVersion}`)
    assert(snapshot.state && typeof snapshot.state === 'object', 'snapshot has no state')
    assert('macros' in snapshot.state && 'screens' in snapshot.state, 'state is missing macros/screens')
  })

  await check('editor snapshots carry catalogs; controller snapshots carry action state', async () => {
    const editor = await connected('editor')
    assert(
      editor.snapshot.catalogs && typeof editor.snapshot.catalogs === 'object',
      'editor snapshot should include catalogs (empty when no node is connected)',
    )
    assert(!('actionState' in editor.snapshot), 'an editor snapshot should not include actionState')
    const controller = await connected('controller')
    assert(!('catalogs' in controller.snapshot), 'controller snapshot should not include catalogs')
    // Present (possibly empty) once an action server is connected to produce readings.
    const { actionState } = controller.snapshot
    assert(actionState === undefined || typeof actionState === 'object', 'controller actionState should be an object')
  })

  await check('editors are sent catalogs when a node registers and disconnects', async () => {
    const { c: editor } = await connected('editor')
    const nodeId = uid('node')
    const node = await connect()
    node.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      role: 'node',
      nodeId,
      label: 'Harness catalog node',
      platform: 'linux',
      catalog: { groups: [{ id: 'g', label: 'G', actions: [{ actionId: 'x', label: 'X', actionFields: [] }] }] },
    })
    const added = await editor.next((m) => m.type === 'catalogs' && nodeId in m.catalogs)
    assert(added.catalogs[nodeId].groups[0].actions[0].actionId === 'x', 'catalog content was not forwarded')
    node.close()
    await editor.next((m) => m.type === 'catalogs' && !(nodeId in m.catalogs))
  })

  await check('a controller may announce the screen it is viewing', async () => {
    const c = await connect()
    c.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'controller', screenId: 'screen-1' })
    const msg = await c.next((m) => m.type === 'snapshot')
    assert(msg.type === 'snapshot', 'controller hello was not answered with a snapshot')
  })

  await check('a version mismatch is refused and the socket closed', async () => {
    const c = await connect()
    c.send({ type: 'hello', protocolVersion: 99, role: 'editor' })
    const msg = await c.next(isError)
    assert(
      msg.error.code === 'unsupported-protocol-version',
      `expected unsupported-protocol-version, got ${msg.error.code}`,
    )
    await c.waitClose()
  })

  await check('a loopback node hello receives plugin sync', async () => {
    const c = await connect()
    c.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      role: 'node',
      nodeId: uid('node'),
      label: 'Harness fake node',
      platform: 'linux',
      catalog: { groups: [] },
    })
    const sync = await c.next((m) => m.type === 'plugin-sync')
    assert(Array.isArray(sync.plugins), 'missing desired plugin set')
    assert(!c.closed, 'the node connection was closed')
  })

  section('Plugin distribution')
  await check('install, sync, serve, update, reject secrets, and delete', async () => {
    const { c: editor } = await connected()
    const node = await connect()
    node.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      role: 'node',
      nodeId: uid('plugin-node'),
      label: 'Plugin node',
      platform: 'linux',
      catalog: { groups: [] },
      plugins: [],
    })
    await node.next((m) => m.type === 'plugin-sync')
    const id = uid('test-plugin')
    const encode = (value) => Buffer.from(value).toString('base64')
    const files = {
      'package.json': encode(
        JSON.stringify({
          name: id,
          version: '1.0.0',
          macrotouch: {
            id,
            label: 'Test',
            apiVersion: 1,
            ui: 'ui.mjs',
            settings: [{ key: 'token', label: 'Token', type: 'string', secret: true }],
          },
        }),
      ),
      'server.mjs': encode('export default {}'),
      'ui.mjs': encode('export const test = true'),
    }
    const sha = createHash('sha256')
      .update(
        JSON.stringify(
          Object.keys(files)
            .sort()
            .map((key) => [key, files[key]]),
        ),
      )
      .digest('hex')
    editor.send({ type: 'install-plugin', requestId: id, files })
    const patch = await editor.next((m) => m.type === 'state-patch' && m.plugins?.[id])
    const result = await editor.next((m) => m.type === 'action-result' && m.requestId === id)
    assert(
      result.ok && result.value.sha256 === sha && patch.plugins[id].sha256 === sha,
      'install result or hash incorrect',
    )
    const sync = await node.next((m) => m.type === 'plugin-sync' && m.plugins.some((p) => p.id === id))
    assert(sync.plugins.find((p) => p.id === id).files['ui.mjs'] === files['ui.mjs'], 'sync omitted files')
    const response = await fetch(`${HTTP_URL}/plugins/${id}/${sha}/ui.mjs`)
    assert(response.status === 200 && (await response.text()) === 'export const test = true', 'UI file not served')
    assert(
      response.headers.get('content-type').startsWith('text/javascript') &&
        response.headers.get('cache-control') === 'public, max-age=31536000, immutable',
      'wrong asset headers',
    )
    assert((await fetch(`${HTTP_URL}/plugins/${id}/${'0'.repeat(64)}/ui.mjs`)).status === 404, 'wrong sha served')
    editor.send({ type: 'update-plugin', pluginId: id, settings: { host: 'example' } })
    assert(
      (await editor.next((m) => m.type === 'state-patch' && m.plugins?.[id]?.settings.host)).plugins[id].settings
        .host === 'example',
      'settings not patched',
    )
    editor.send({ type: 'update-plugin', pluginId: id, settings: { token: 'private' } })
    assert((await editor.next(isError)).error.code === 'invalid-message', 'secret was accepted')
    editor.send({ type: 'delete-plugin', pluginId: id })
    await editor.next((m) => m.type === 'state-patch' && m.plugins?.[id] === null)
    assert((await fetch(`${HTTP_URL}/plugins/${id}/${sha}/ui.mjs`)).status === 404, 'deleted plugin served')
    node.close()
  })
  await check('invalid plugin paths and reserved ids are rejected', async () => {
    const { c } = await connected()
    const encode = (value) => Buffer.from(value).toString('base64')
    for (const [id, extra] of [
      ['test-bad', { '../x': '' }],
      ['core-x', {}],
    ]) {
      const files = {
        'package.json': encode(
          JSON.stringify({ name: id, version: '1', macrotouch: { id, label: id, apiVersion: 1 } }),
        ),
        'server.mjs': '',
        ...extra,
      }
      c.send({ type: 'install-plugin', requestId: id, files })
      const result = await c.next((m) => m.type === 'action-result' && m.requestId === id)
      assert(!result.ok && result.error.code === 'invalid-plugin', 'invalid plugin accepted')
    }
  })
  await check('shared file validation rejects case collisions and reserved markers without a patch', async () => {
    const { c } = await connected()
    const encode = (value) => Buffer.from(value).toString('base64')
    for (const extra of [{ 'a.js': '', 'A.js': '' }, { '.sha256': '' }]) {
      const id = uid('invalid-files')
      const files = {
        'package.json': encode(
          JSON.stringify({ name: id, version: '1', macrotouch: { id, label: id, apiVersion: 1 } }),
        ),
        'server.mjs': '',
        ...extra,
      }
      c.send({ type: 'install-plugin', requestId: id, files })
      const result = await c.next((m) => m.type === 'action-result' && m.requestId === id)
      assert(!result.ok && result.error.code === 'invalid-plugin', 'invalid files accepted')
      assert(
        !(await c.quiet()).some((m) => m.type === 'state-patch' && m.plugins?.[id]),
        'invalid install patched state',
      )
    }
  })
  await check('failed sync attempts are suppressed until the package changes', async () => {
    const { c: editor } = await connected()
    const node = await connect()
    const hello = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      role: 'node',
      nodeId: uid('sync-node'),
      label: 'Sync',
      platform: 'linux',
      catalog: { groups: [] },
      plugins: [],
    }
    node.send(hello)
    await node.next((m) => m.type === 'plugin-sync')
    const id = uid('sync-plugin')
    const encode = (v) => Buffer.from(v).toString('base64')
    const files = {
      'package.json': encode(JSON.stringify({ name: id, version: '1', macrotouch: { id, label: id, apiVersion: 1 } })),
      'server.mjs': '',
    }
    editor.send({ type: 'install-plugin', requestId: id, files })
    await editor.next((m) => m.type === 'action-result' && m.requestId === id)
    assert(
      (await node.next((m) => m.type === 'plugin-sync')).plugins.find((p) => p.id === id).files,
      'first attempt missing',
    )
    node.send(hello)
    assert((await node.next((m) => m.type === 'plugin-sync')).plugins.find((p) => p.id === id).files, 'retry missing')
    node.send(hello)
    assert(
      !(await node.next((m) => m.type === 'plugin-sync')).plugins.find((p) => p.id === id).files,
      'failed package resent',
    )
    files['server.mjs'] = encode('export default {}')
    editor.send({ type: 'install-plugin', requestId: `${id}-update`, files })
    await editor.next((m) => m.type === 'action-result' && m.requestId === `${id}-update`)
    assert(
      (await node.next((m) => m.type === 'plugin-sync')).plugins.find((p) => p.id === id).files,
      'updated package suppressed',
    )
    editor.send({ type: 'delete-plugin', pluginId: id })
    await editor.next((m) => m.type === 'state-patch' && m.plugins?.[id] === null)
    node.close()
  })
  await check('controllers cannot install, send secrets or test plugins', async () => {
    const { c } = await connected('controller')
    c.send({ type: 'install-plugin', requestId: 'forbidden', files: {} })
    assert(
      (await c.next((m) => m.type === 'action-result' && m.requestId === 'forbidden')).error.code === 'forbidden',
      'install was permitted',
    )
    c.send({ type: 'plugin-secrets', pluginId: 'x', nodeId: 'all', values: { token: 'private' } })
    assert((await c.next(isError)).error.code === 'forbidden', 'secrets were permitted')
    c.send({ type: 'test-plugin', requestId: 'forbidden-test', pluginId: 'x' })
    assert(
      (await c.next((m) => m.requestId === 'forbidden-test')).error.code === 'forbidden',
      'plugin test was permitted',
    )
  })
  await check('unknown node is offline for options and macro triggers', async () => {
    const { c } = await connected()
    c.send({
      type: 'list-options',
      requestId: 'offline-options',
      nodeId: 'missing-node',
      actionId: 'x/y',
      field: 'field',
    })
    assert(
      (await c.next((m) => m.type === 'action-result' && m.requestId === 'offline-options')).error.code ===
        'node-offline',
      'options did not report offline',
    )
    c.send({ type: 'test-plugin', requestId: 'offline-test', nodeId: 'missing-node', pluginId: 'x' })
    assert(
      (await c.next((m) => m.type === 'action-result' && m.requestId === 'offline-test')).error.code === 'node-offline',
      'plugin test did not report offline',
    )
    const macro = { ...makeMacro(), nodeId: 'missing-node', actionId: 'x/y' }
    c.send({ type: 'upsert-macro', macro })
    await c.next((m) => m.type === 'state-patch' && m.macros?.[macro.id])
    c.send({ type: 'macro-trigger', requestId: 'offline-macro', macroId: macro.id })
    assert(
      (await c.next((m) => m.type === 'action-result' && m.requestId === 'offline-macro')).error.code ===
        'node-offline',
      'macro did not report offline',
    )
  })

  /* -- commands and patches ----------------------------------------------- */
  section('Commands and patches')

  await check('upsert-screen returns a delta, not the whole state', async () => {
    const { c } = await connected()
    const screen = makeScreen()
    c.send({ type: 'upsert-screen', screen })
    const patch = await c.next(isPatch)
    assert(patch.screens?.[screen.id], 'patch does not carry the screen')
    assert(!('macros' in patch), 'patch should not mention macros when none changed')
    assert(Object.keys(patch.screens).length === 1, 'patch should carry only the changed screen')
  })

  await check('upsert-macro with placement patches both maps', async () => {
    const { c } = await connected()
    const screen = makeScreen()
    c.send({ type: 'upsert-screen', screen })
    await c.next(isPatch)

    const macro = makeMacro()
    c.send({ type: 'upsert-macro', macro, placement: { screenId: screen.id, position: { row: 0, column: 1 } } })
    const patch = await c.next(isPatch)

    assert(patch.macros?.[macro.id], 'patch does not carry the macro')
    assert(patch.screens?.[screen.id], 'patch does not carry the screen')
    assert(
      patch.screens[screen.id].macroRows[0].macrosIds[1] === macro.id,
      'the macro was not written into the placed cell',
    )
  })

  await check('delete-macro sends a null tombstone', async () => {
    const { c } = await connected()
    const screen = makeScreen()
    c.send({ type: 'upsert-screen', screen })
    await c.next(isPatch)

    const macro = makeMacro()
    c.send({ type: 'upsert-macro', macro, placement: { screenId: screen.id, position: { row: 0, column: 0 } } })
    await c.next(isPatch)

    c.send({ type: 'delete-macro', screenId: screen.id, position: { row: 0, column: 0 } })
    const patch = await c.next(isPatch)

    assert(macro.id in (patch.macros ?? {}), 'patch does not mention the deleted macro')
    assert(patch.macros[macro.id] === null, 'removal must be an explicit null, not an omitted key')
    assert(patch.screens[screen.id].macroRows[0].macrosIds[0] === '', 'the cell was not cleared')
  })

  await check('move-macro clears the source cell and fills the target', async () => {
    const { c } = await connected()
    const screen = makeScreen()
    c.send({ type: 'upsert-screen', screen })
    await c.next(isPatch)

    const macro = makeMacro()
    c.send({ type: 'upsert-macro', macro, placement: { screenId: screen.id, position: { row: 0, column: 0 } } })
    await c.next(isPatch)

    c.send({ type: 'move-macro', screenId: screen.id, from: { row: 0, column: 0 }, to: { row: 1, column: 2 } })
    const patch = await c.next(isPatch)
    const rows = patch.screens[screen.id].macroRows

    assert(rows[0].macrosIds[0] === '', 'source cell was not cleared')
    assert(rows[1].macrosIds[2] === macro.id, 'target cell was not filled')
  })

  await check('move-macro onto an occupied cell swaps the two macros', async () => {
    const { c } = await connected()
    const screen = makeScreen()
    c.send({ type: 'upsert-screen', screen })
    await c.next(isPatch)

    const a = makeMacro()
    const b = makeMacro()
    c.send({ type: 'upsert-macro', macro: a, placement: { screenId: screen.id, position: { row: 0, column: 0 } } })
    await c.next(isPatch)
    c.send({ type: 'upsert-macro', macro: b, placement: { screenId: screen.id, position: { row: 1, column: 2 } } })
    await c.next(isPatch)

    c.send({ type: 'move-macro', screenId: screen.id, from: { row: 0, column: 0 }, to: { row: 1, column: 2 } })
    const rows = (await c.next(isPatch)).screens[screen.id].macroRows

    assert(rows[0].macrosIds[0] === b.id, 'the displaced macro was not moved to the source cell')
    assert(rows[1].macrosIds[2] === a.id, 'the moved macro is not in the target cell')
  })

  /** A 2x3 screen with `macro` at 0,0, ready to resize. */
  const withMacroAtOrigin = async () => {
    const { c } = await connected()
    const screen = makeScreen()
    c.send({ type: 'upsert-screen', screen })
    await c.next(isPatch)
    const macro = makeMacro()
    c.send({ type: 'upsert-macro', macro, placement: { screenId: screen.id, position: { row: 0, column: 0 } } })
    await c.next(isPatch)
    return { c, screen, macro }
  }
  const at = (row, column) => ({ row, column })

  await check('resize-macro gives a macro a span, and 1x1 takes it away again', async () => {
    const { c, screen, macro } = await withMacroAtOrigin()
    c.send({ type: 'resize-macro', screenId: screen.id, position: at(0, 0), span: { rows: 2, columns: 2 } })
    const grown = await c.next(isPatch)
    assert(grown.macros?.[macro.id]?.span?.rows === 2, 'the macro did not get its span')
    assert(grown.macros[macro.id].span.columns === 2, 'the span has the wrong columns')

    c.send({ type: 'resize-macro', screenId: screen.id, position: at(0, 0), span: { rows: 1, columns: 1 } })
    const shrunk = await c.next(isPatch)
    assert(!('span' in shrunk.macros[macro.id]), 'a one-cell macro should carry no span')
  })

  await check('resize-macro with an anchor grows a macro up and left', async () => {
    const { c, screen, macro } = await withMacroAtOrigin()
    c.send({ type: 'move-macro', screenId: screen.id, from: at(0, 0), to: at(1, 1) })
    await c.next(isPatch)
    c.send({
      type: 'resize-macro',
      screenId: screen.id,
      position: at(1, 1),
      anchor: at(0, 0),
      span: { rows: 2, columns: 2 },
    })
    const patch = await c.next(isPatch)
    const rows = patch.screens?.[screen.id]?.macroRows
    assert(rows?.[0]?.macrosIds[0] === macro.id, 'the macro did not move to its new top-left cell')
    assert(!rows[1].macrosIds[1], 'the old top-left cell still names the macro')
    assert(patch.macros[macro.id].span.rows === 2, 'the span was not applied')

    c.send({
      type: 'resize-macro',
      screenId: screen.id,
      position: at(0, 0),
      anchor: at(0, 1),
      span: { rows: 3, columns: 1 },
    })
    assert(isError(await c.next(isError)), 'an anchor that pushes the macro off the grid was accepted')
  })

  await check('resize-macro is refused where the macro would not fit', async () => {
    const { c, screen } = await withMacroAtOrigin()
    c.send({ type: 'resize-macro', screenId: screen.id, position: at(0, 0), span: { rows: 3, columns: 1 } })
    assert(isError(await c.next(isError)), 'a span past the last row was accepted')

    const blocker = makeMacro()
    c.send({ type: 'upsert-macro', macro: blocker, placement: { screenId: screen.id, position: at(1, 1) } })
    await c.next(isPatch)
    c.send({ type: 'resize-macro', screenId: screen.id, position: at(0, 0), span: { rows: 2, columns: 2 } })
    assert(isError(await c.next(isError)), 'a span over another macro was accepted')
  })

  await check('a cell covered by a larger macro cannot take a new macro', async () => {
    const { c, screen } = await withMacroAtOrigin()
    c.send({ type: 'resize-macro', screenId: screen.id, position: at(0, 0), span: { rows: 2, columns: 2 } })
    await c.next(isPatch)
    c.send({ type: 'upsert-macro', macro: makeMacro(), placement: { screenId: screen.id, position: at(1, 1) } })
    assert(isError(await c.next(isError)), 'a macro was placed on a covered cell')
  })

  await check('editing a macro keeps its span', async () => {
    const { c, screen, macro } = await withMacroAtOrigin()
    c.send({ type: 'resize-macro', screenId: screen.id, position: at(0, 0), span: { rows: 1, columns: 2 } })
    await c.next(isPatch)
    c.send({ type: 'upsert-macro', macro: { ...macro, name: 'Renamed' } })
    const patch = await c.next(isPatch)
    assert(patch.macros[macro.id].name === 'Renamed', 'the edit was not applied')
    assert(patch.macros[macro.id].span?.columns === 2, 'the edit dropped the span')
  })

  await check('a client cannot set a span through an upsert', async () => {
    const { c, macro } = await withMacroAtOrigin()
    c.send({ type: 'upsert-macro', macro: { ...macro, span: { rows: 9, columns: 9 } } })
    const patch = await c.next(isPatch)
    assert(!patch.macros[macro.id].span, 'an upsert set a span that never went through resize-macro')
  })

  await check('move-macro moves a large macro as a whole, and refuses a move that would overlap', async () => {
    const { c, screen, macro } = await withMacroAtOrigin()
    c.send({ type: 'resize-macro', screenId: screen.id, position: at(0, 0), span: { rows: 2, columns: 1 } })
    await c.next(isPatch)

    c.send({ type: 'move-macro', screenId: screen.id, from: at(0, 0), to: at(0, 2) })
    const moved = (await c.next(isPatch)).screens[screen.id].macroRows
    assert(moved[0].macrosIds[2] === macro.id && moved[0].macrosIds[0] === '', 'the macro did not move')

    // A 2-row macro cannot be anchored on the last row.
    c.send({ type: 'move-macro', screenId: screen.id, from: at(0, 2), to: at(1, 1) })
    const refused = await c.next(isPatch)
    assert(!refused.screens, 'a move past the bottom edge was applied')
  })

  await check("move-macro swaps macros of different sizes when each fits the other's place", async () => {
    const { c, screen, macro } = await withMacroAtOrigin()
    const small = makeMacro()
    c.send({ type: 'upsert-macro', macro: small, placement: { screenId: screen.id, position: at(0, 2) } })
    await c.next(isPatch)
    c.send({ type: 'resize-macro', screenId: screen.id, position: at(0, 0), span: { rows: 1, columns: 2 } })
    await c.next(isPatch)

    // The 1x2 macro shifts right over the small one, which takes the freed corner.
    c.send({ type: 'move-macro', screenId: screen.id, from: at(0, 0), to: at(0, 1) })
    const row = (await c.next(isPatch)).screens[screen.id].macroRows[0].macrosIds
    assert(row[1] === macro.id && row[0] === small.id && row[2] === '', `unexpected row ${JSON.stringify(row)}`)
  })

  await check('move-macro refuses a swap when the displaced macro would not fit', async () => {
    const { c, screen } = await withMacroAtOrigin()
    c.send({ type: 'move-macro', screenId: screen.id, from: at(0, 0), to: at(0, 1) })
    await c.next(isPatch)
    const wide = makeMacro()
    c.send({ type: 'upsert-macro', macro: wide, placement: { screenId: screen.id, position: at(1, 0) } })
    await c.next(isPatch)
    c.send({ type: 'resize-macro', screenId: screen.id, position: at(1, 0), span: { rows: 1, columns: 3 } })
    await c.next(isPatch)

    // Swapping would put the 1x3 macro at 0,1, running off the right edge.
    c.send({ type: 'move-macro', screenId: screen.id, from: at(0, 1), to: at(1, 1) })
    const refused = await c.next(isPatch)
    assert(!refused.screens, 'a swap that overflows the grid was applied')
  })

  await check('a cell naming a macro that no longer exists counts as empty', async () => {
    const { c } = await connected()
    const screen = makeScreen()
    screen.macroRows[0].macrosIds[0] = uid('gone')
    c.send({ type: 'upsert-screen', screen })
    await c.next(isPatch)
    const macro = makeMacro()
    c.send({ type: 'upsert-macro', macro, placement: { screenId: screen.id, position: { row: 0, column: 0 } } })
    const patch = await c.next((m) => isPatch(m) || isError(m))
    assert(patch.screens?.[screen.id]?.macroRows[0].macrosIds[0] === macro.id, 'the dangling cell refused a new macro')
  })

  await check('delete-screen cascades tombstones for its macros', async () => {
    const { c } = await connected()
    const screen = makeScreen()
    c.send({ type: 'upsert-screen', screen })
    await c.next(isPatch)

    const macro = makeMacro()
    c.send({ type: 'upsert-macro', macro, placement: { screenId: screen.id, position: { row: 0, column: 0 } } })
    await c.next(isPatch)

    c.send({ type: 'delete-screen', screenId: screen.id })
    const patch = await c.next(isPatch)

    assert(patch.screens?.[screen.id] === null, 'the screen was not tombstoned')
    assert(patch.macros?.[macro.id] === null, 'the macro on the screen was not tombstoned')
  })

  await check('update-settings patches settings only', async () => {
    const { c } = await connected()
    c.send({ type: 'update-settings', settings: { swipeToChangeScreens: false } })
    const patch = await c.next(isPatch)

    assert(patch.settings?.swipeToChangeScreens === false, 'the setting did not come back')
    assert(!('macros' in patch) && !('screens' in patch), 'a settings change must not touch macros or screens')

    c.send({ type: 'update-settings', settings: { swipeToChangeScreens: true } })
    await c.next(isPatch)
  })

  /* -- isolated action routing --------------------------------------------- */
  section('Isolated action routing')

  await check('migration, routing errors, forwarding and catalog refresh', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-gateway-'))
    const legacy = { ...makeMacro('Legacy', 'legacy'), actionId: 'keyCombo' }
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ macros: { legacy }, screens: {}, settings: {} }))
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer()
      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port
        server.close(() => resolve(port))
      })
    })
    const child = spawn('node_modules/.bin/tsx', ['master-server/protocol-fixture.ts'], {
      env: { ...process.env, MACROTOUCH_DATA_DIR: dir, WS_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const url = `ws://127.0.0.1:${port}`
    const local = []
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('isolated gateway did not start')), 5000)
        child.stdout.on('data', (chunk) => {
          if (chunk.toString().includes('WebSocket server started')) {
            clearTimeout(timer)
            resolve()
          }
        })
        child.once('exit', () => {
          clearTimeout(timer)
          reject(new Error('isolated gateway exited'))
        })
      })
      const editor = await open(url)
      local.push(editor)
      editor.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'editor' })
      const snapshot = await editor.next((m) => m.type === 'snapshot')
      assert(snapshot.state.macros.legacy.actionId === 'core-keyboard/keyCombo', 'legacy id was not migrated')
      await new Promise((resolve) => setTimeout(resolve, 100))
      assert(
        JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf-8')).macros.legacy.actionId ===
          'core-keyboard/keyCombo',
        'migration was not persisted',
      )
      const controller = await open(url)
      local.push(controller)
      controller.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'controller' })
      await controller.next((m) => m.type === 'snapshot')
      controller.send({ type: 'macro-trigger', requestId: 'offline', macroId: 'legacy' })
      const offline = await controller.next((m) => m.type === 'action-result')
      assert(
        offline.requestId === 'offline' && !offline.ok && offline.error.code === 'node-offline',
        'offline result incorrect',
      )

      const node = await open(url)
      local.push(node)
      const hello = (availability) => ({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        role: 'node',
        nodeId: 'fixture',
        local: true,
        label: 'Fixture',
        platform: 'linux',
        catalog: {
          groups: [
            {
              id: 'core-keyboard',
              label: 'Keyboard',
              version: '1',
              actions: [{ actionId: 'core-keyboard/keyCombo', label: 'Key', actionFields: [], availability }],
            },
          ],
        },
      })
      node.send(hello('invalid'))
      const invalid = await node.next((m) => m.type === 'error')
      assert(invalid.error.code === 'invalid-message', 'malformed availability was accepted')
      for (const [status, code] of [
        ['unsupported-platform', 'unsupported-platform'],
        ['missing-dependency', 'action-unavailable'],
      ]) {
        node.send(hello({ status, message: status }))
        await editor.next(
          (m) => m.type === 'catalogs' && m.catalogs.fixture?.groups[0].actions[0].availability.status === status,
        )
        controller.send({ type: 'macro-trigger', requestId: status, macroId: 'legacy' })
        const result = await controller.next((m) => m.type === 'action-result' && m.requestId === status)
        assert(
          !result.ok && result.error.code === code && result.error.details.status === status,
          `wrong ${status} result`,
        )
        assert(!(await node.quiet()).some((m) => m.type === 'run-action'), `${status} was sent to node`)
      }
      for (const status of ['not-ready', 'not-configured']) {
        node.send(hello({ status, message: 'Wait' }))
        await editor.next(
          (m) => m.type === 'catalogs' && m.catalogs.fixture?.groups[0].actions[0].availability.status === status,
        )
        controller.send({ type: 'macro-trigger', requestId: status, macroId: 'legacy' })
        const run = await node.next((m) => m.type === 'run-action')
        const response = {
          type: 'action-result',
          requestId: run.requestId,
          ok: false,
          error: { code: 'plugin-error', message: 'failed' },
        }
        node.send(response)
        const result = await controller.next((m) => m.type === 'action-result' && m.requestId === status)
        assert(
          JSON.stringify(result) === JSON.stringify({ ...response, requestId: status }),
          'node result changed or was not forwarded',
        )
      }
      const second = await open(url)
      local.push(second)
      second.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'controller' })
      await second.next((m) => m.type === 'snapshot')
      controller.send({ type: 'macro-trigger', requestId: 'shared', macroId: 'legacy' })
      second.send({ type: 'macro-trigger', requestId: 'shared', macroId: 'legacy' })
      const firstRun = await node.next((m) => m.type === 'run-action')
      const secondRun = await node.next((m) => m.type === 'run-action')
      assert(firstRun.requestId !== secondRun.requestId, 'routed request ids collided')
      node.send({ type: 'action-result', requestId: firstRun.requestId, ok: true })
      node.send({ type: 'action-result', requestId: secondRun.requestId, ok: true })
      assert((await controller.next((m) => m.type === 'action-result')).requestId === 'shared', 'first id changed')
      assert((await second.next((m) => m.type === 'action-result')).requestId === 'shared', 'second id changed')
    } finally {
      for (const c of local) c.close()
      child.kill('SIGTERM')
      await new Promise((resolve) => child.once('exit', resolve))
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  await check('in-flight caps apply across request types and recover on result and disconnect', async () => {
    const nodeId = uid('cap-node')
    const node = await connect()
    node.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      role: 'node',
      nodeId,
      label: 'Cap',
      platform: 'linux',
      catalog: {
        groups: [{ id: 'g', label: 'G', actions: [{ actionId: 'cap/action', label: 'Cap', actionFields: [] }] }],
      },
    })
    await node.next((m) => m.type === 'plugin-sync')
    const editors = []
    for (let i = 0; i < 5; i++) editors.push((await connected()).c)
    const macro = { ...makeMacro(), nodeId, actionId: 'cap/action' }
    editors[0].send({ type: 'upsert-macro', macro })
    await editors[0].next((m) => isPatch(m) && m.macros?.[macro.id])
    const option = (client, id) =>
      client.send({ type: 'list-options', requestId: id, nodeId, actionId: 'cap/action', field: 'x' })
    for (let i = 0; i < 32; i++) option(editors[0], `a${i}`)
    const runs = []
    for (let i = 0; i < 32; i++) runs.push(await node.next((m) => m.type === 'list-options'))
    editors[0].send({ type: 'macro-trigger', requestId: 'over-client', macroId: macro.id })
    const assertCap = (r) =>
      assert(
        !r.ok && r.error.code === 'action-failed' && r.error.message === 'Too many requests in flight',
        'wrong cap response',
      )
    assertCap(await editors[0].next((m) => m.type === 'action-result' && m.requestId === 'over-client'))
    node.send({ type: 'action-result', requestId: runs[0].requestId, ok: true })
    await editors[0].next((m) => m.type === 'action-result' && m.requestId === 'a0')
    editors[0].send({ type: 'macro-trigger', requestId: 'recovered', macroId: macro.id })
    await node.next((m) => m.type === 'run-action')
    for (let j = 1; j <= 3; j++) for (let i = 0; i < 32; i++) option(editors[j], `b${j}-${i}`)
    for (let i = 0; i < 96; i++) await node.next((m) => m.type === 'list-options')
    option(editors[4], 'over-node')
    assertCap(await editors[4].next((m) => m.type === 'action-result' && m.requestId === 'over-node'))
    editors[1].close()
    await editors[1].waitClose()
    option(editors[4], 'after-disconnect')
    await node.next((m) => m.type === 'list-options')
    node.close()
  })

  /* -- action routing ------------------------------------------------------ */
  section('Action routing')

  await check('macro-trigger runs the action in the action server', async () => {
    // The server under test launches its own local action server, which gets
    // the trigger. The harness shares its machine, so the effect is a file.
    const marker = path.join(os.tmpdir(), `mt-protocol-check-${Date.now()}`)
    const { c: editor } = await connected('editor')
    const macro = {
      ...makeMacro('Harness shell command'),
      actionId: 'core-system/shellCommand',
      parameters: { command: `touch "${marker}"` },
    }
    editor.send({ type: 'upsert-macro', macro })
    await editor.next(isPatch)

    const { c: controller } = await connected('controller')
    controller.send({ type: 'macro-trigger', requestId: uid('request'), macroId: macro.id })

    const deadline = Date.now() + TIMEOUT
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
    const ran = fs.existsSync(marker)
    fs.rmSync(marker, { force: true })
    assert(ran, 'the action server did not run the shell command (is it connected to the master?)')
  })

  await check('an oversized row is clamped to the declared columns (SC-06)', async () => {
    const { c } = await connected()
    const screen = makeScreen(1, 3)
    screen.macroRows = [{ macrosIds: ['a', 'b', 'c', 'd', 'e', 'f'] }]
    c.send({ type: 'upsert-screen', screen })
    const patch = await c.next(isPatch)

    const row = patch.screens[screen.id].macroRows[0]
    assert(row.macrosIds.length === 3, `expected 3 columns after clamping, got ${row.macrosIds.length}`)
  })

  await check('a short screen is padded up to its declared rows', async () => {
    const { c } = await connected()
    const screen = makeScreen(3, 2)
    screen.macroRows = [{ macrosIds: ['', ''] }]
    c.send({ type: 'upsert-screen', screen })
    const patch = await c.next(isPatch)

    const rows = patch.screens[screen.id].macroRows
    assert(rows.length === 3, `expected 3 rows after padding, got ${rows.length}`)
  })

  /* -- errors -------------------------------------------------------------- */
  section('Live action state')

  await check('a viewed stateful macro is watched, reported to controllers, and unwatched', async () => {
    // A fake node with a uniquely named toggle action, so the real action
    // server never claims it.
    const actionId = uid('harnessToggle')
    const stateNodeId = uid('node')
    const node = await connect()
    node.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      role: 'node',
      nodeId: stateNodeId,
      label: 'Harness state node',
      platform: 'linux',
      catalog: {
        groups: [
          {
            id: 'g',
            label: 'G',
            actions: [
              {
                actionId,
                label: 'T',
                actionFields: [],
                states: [{ kind: 'toggle' }],
              },
            ],
          },
        ],
      },
    })

    const { c: editor } = await connected('editor')
    const screen = makeScreen(1, 1)
    editor.send({ type: 'upsert-screen', screen })
    await editor.next(isPatch)
    const macro = {
      ...makeMacro('Harness toggle'),
      actionId,
      nodeId: stateNodeId,
      parameters: {},
    }
    editor.send({
      type: 'upsert-macro',
      macro,
      placement: { screenId: screen.id, position: { row: 0, column: 0 } },
    })
    await editor.next(isPatch)

    const { c: controller } = await connected('controller')
    controller.send({ type: 'view-screen', screenId: screen.id })
    const watch = await node.next((m) => m.type === 'watch-actions' && m.actions.length > 0)
    assert(watch.actions[0].actionId === actionId, `expected ${actionId} watched, got ${JSON.stringify(watch.actions)}`)
    const key = watch.actions[0].key

    node.send({
      type: 'action-state',
      states: [{ key, nodeId: 'n', value: true, updatedAt: Date.now() }],
    })
    const state = await controller.next((m) => m.type === 'action-state')
    assert(state.states[0].key === key && state.states[0].value === true, 'the reading did not reach the controller')

    const { snapshot: late } = await connected('controller')
    assert(late.actionState?.[key]?.value === true, 'a later controller snapshot is missing the cached reading')

    controller.send({ type: 'view-screen', screenId: null })
    const unwatch = await node.next((m) => m.type === 'watch-actions')
    assert(unwatch.actions.length === 0, `expected an empty watch list, got ${JSON.stringify(unwatch.actions)}`)
    node.close()
  })

  section('Errors')

  await check('malformed JSON is rejected and the socket stays open', async () => {
    const { c } = await connected()
    c.raw('this is not json')
    const msg = await c.next(isError)
    assert(msg.error.code === 'invalid-message', `expected invalid-message, got ${msg.error.code}`)

    // The connection must still be usable afterwards.
    const screen = makeScreen()
    c.send({ type: 'upsert-screen', screen })
    const patch = await c.next(isPatch)
    assert(patch.screens?.[screen.id], 'the socket stopped working after a malformed message')
    assert(!c.closed, 'the socket was closed by a malformed message')
  })

  await check('a bad command shape names the missing field', async () => {
    const { c } = await connected()
    c.send({ type: 'upsert-macro' })
    const msg = await c.next(isError)
    assert(msg.error.code === 'invalid-message', `expected invalid-message, got ${msg.error.code}`)
    assert(/macro/i.test(msg.error.message), `expected the message to name the field, got "${msg.error.message}"`)
  })

  await check('an unknown message type is rejected', async () => {
    const { c } = await connected()
    c.send({ type: 'teleport-macro', macroId: 'x' })
    const msg = await c.next(isError)
    assert(msg.error.code === 'invalid-message', `expected invalid-message, got ${msg.error.code}`)
  })

  await check('a command naming a missing screen returns unknown-screen', async () => {
    const { c } = await connected()
    c.send({ type: 'delete-macro', screenId: 'no-such-screen', position: { row: 0, column: 0 } })
    const msg = await c.next(isError)
    assert(msg.error.code === 'unknown-screen', `expected unknown-screen, got ${msg.error.code}`)
  })

  await check('a position outside the screen is rejected', async () => {
    const { c } = await connected()
    const screen = makeScreen(2, 3)
    c.send({ type: 'upsert-screen', screen })
    await c.next(isPatch)

    c.send({ type: 'delete-macro', screenId: screen.id, position: { row: 9, column: 9 } })
    const msg = await c.next(isError)
    assert(msg.error.code === 'invalid-message', `expected invalid-message, got ${msg.error.code}`)
  })

  /* -- sync ---------------------------------------------------------------- */
  section('Sync')

  await check('a patch reaches every client, the sender included (SY-02)', async () => {
    const { c: a } = await connected()
    const { c: b } = await connected()

    const screen = makeScreen()
    a.send({ type: 'upsert-screen', screen })

    const toSender = await a.next(isPatch)
    const toOther = await b.next(isPatch)

    assert(toSender.screens?.[screen.id], 'the sender did not receive its own patch')
    assert(toOther.screens?.[screen.id], 'the other client did not receive the patch')
  })

  await check('concurrent edits to different macros both survive (SY-06)', async () => {
    const { c: a } = await connected()
    const { c: b } = await connected()

    const macroA = makeMacro('From A')
    const macroB = makeMacro('From B')

    // Both sent before either has seen the other's patch — the race that lost
    // an edit on master, where each client sent the whole state map.
    a.send({ type: 'upsert-macro', macro: macroA })
    b.send({ type: 'upsert-macro', macro: macroB })

    await a.next((m) => isPatch(m) && !!m.macros?.[macroA.id])
    await a.next((m) => isPatch(m) && !!m.macros?.[macroB.id])

    // Confirm against a fresh snapshot rather than the patches alone.
    const { snapshot } = await connected()
    assert(snapshot.state.macros[macroA.id], "A's macro was lost")
    assert(snapshot.state.macros[macroB.id], "B's macro was lost")
    assert(snapshot.state.macros[macroA.id].name === 'From A', "A's macro was overwritten")
    assert(snapshot.state.macros[macroB.id].name === 'From B', "B's macro was overwritten")
  })

  /* -- pairing ------------------------------------------------------------- */
  section('Pairing')

  // Both halves need something only the environment can supply: the token the
  // server is enforcing, and an address that is not loopback. Without either,
  // these checks would pass for the wrong reason, so they skip instead.
  const token = readToken()
  const remoteUrl = await remoteWsUrl()

  await check('a local client needs no token', async () => {
    const { snapshot } = await connected('controller')
    assert(snapshot.type === 'snapshot', 'a loopback controller was not given a snapshot')
  })

  if (!token) {
    skip(
      'the local editor is told the pairing token',
      'set MACROTOUCH_DATA_DIR to the directory the server under test is using',
    )
  } else {
    await check('the local editor is told the pairing token', async () => {
      const { snapshot } = await connected('editor')
      assert(snapshot.pairingToken === token, `expected the token from ${TOKEN_FILE}, got ${snapshot.pairingToken}`)
    })

    await check('a controller is never told the pairing token', async () => {
      const { snapshot } = await connected('controller')
      assert(snapshot.pairingToken === undefined, 'a controller snapshot carried the pairing token')
    })
  }

  if (!remoteUrl) {
    skip('a remote client without a token is refused', 'no non-loopback interface, so the gate cannot be exercised')
    skip('a remote client with a stale token is refused', 'no non-loopback interface')
    skip('a remote client with a valid token is let in', 'no non-loopback interface')
    skip('regenerating the token drops remote clients', 'no non-loopback interface')
  } else {
    await check('a remote client without a token is refused', async () => {
      const c = await connect(remoteUrl)
      c.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'controller' })
      const msg = await c.next(isError)
      assert(msg.error.code === 'invalid-token', `expected invalid-token, got ${msg.error.code}`)
      await c.waitClose()
      // The point of the ticket: a refused client gets no state at all.
      const seen = await c.quiet(200)
      assert(!seen.some((m) => m.type === 'snapshot'), 'a refused client was sent a snapshot')
    })

    await check('a remote client with a stale token is refused', async () => {
      const c = await connect(remoteUrl)
      c.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'controller', token: 'not-the-token' })
      const msg = await c.next(isError)
      assert(msg.error.code === 'invalid-token', `expected invalid-token, got ${msg.error.code}`)
      await c.waitClose()
    })

    if (!token) {
      skip('a remote client with a valid token is let in', 'set MACROTOUCH_DATA_DIR')
      skip('regenerating the token drops remote clients', 'set MACROTOUCH_DATA_DIR')
    } else {
      await check('a remote client with a valid token is let in', async () => {
        const c = await connect(remoteUrl)
        c.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'controller', token })
        const snapshot = await c.next((m) => m.type === 'snapshot')
        assert(snapshot.state, 'a paired remote client got a snapshot with no state')
      })

      await check('a remote editor cannot regenerate the token', async () => {
        const c = await connect(remoteUrl)
        c.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'editor', token })
        await c.next((m) => m.type === 'snapshot')
        c.send({ type: 'regenerate-token' })
        const msg = await c.next(isError)
        assert(msg.error.code === 'invalid-message', `expected invalid-message, got ${msg.error.code}`)
      })

      // Last, because it invalidates the token every check above relies on.
      await check('regenerating the token drops remote clients', async () => {
        const remote = await connect(remoteUrl)
        remote.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'controller', token })
        await remote.next((m) => m.type === 'snapshot')

        const { c: editor } = await connected('editor')
        editor.send({ type: 'regenerate-token' })

        const issued = await editor.next((m) => m.type === 'pairing-token')
        assert(issued.token !== token, 'regenerate-token handed back the same token')
        assert(readToken() === issued.token, 'the new token was not persisted')

        await remote.waitClose()
        assert(!editor.closed, 'the local editor was dropped along with the remote clients')

        const stale = await connect(remoteUrl)
        stale.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'controller', token })
        const msg = await stale.next(isError)
        assert(msg.error.code === 'invalid-token', `the old token still works: got ${msg.error.code}`)
      })
    }
  }

  await imageChecks()

  /* -- persistence --------------------------------------------------------- */
  section('Persistence')

  // This must look at `firstSnapshot`, not at the file. By the time the file
  // is written, `update-settings` above has already created the key — which
  // would mask exactly the regression this check exists to catch.
  if (!DATA_DIR) {
    skip(
      'the master seeds settings with no client input (ST-02)',
      'set MACROTOUCH_DATA_DIR to the directory the server under test is using',
    )
  } else if (!startedFresh) {
    skip(
      'the master seeds settings with no client input (ST-02)',
      `${STATE_FILE} already existed; delete the data dir and re-run to cover this`,
    )
  } else {
    await check('the master seeds settings with no client input (ST-02)', () => {
      const s = firstSnapshot.state.settings
      assert(s, 'the first snapshot carried no settings — the master is not seeding its own defaults')
      assert(s.defaultScreenSize?.rows === 3, `expected default rows 3, got ${s.defaultScreenSize?.rows}`)
      assert(s.defaultScreenSize?.columns === 5, `expected default columns 5, got ${s.defaultScreenSize?.columns}`)
      assert(typeof s.attemptFullscreen === 'boolean', 'attemptFullscreen missing from seeded settings')
      assert(typeof s.swipeToChangeScreens === 'boolean', 'swipeToChangeScreens missing from seeded settings')
    })
  }

  if (!DATA_DIR) {
    skip(
      'state.json is written, pretty-printed, with all three keys',
      'set MACROTOUCH_DATA_DIR to the directory the server under test is using',
    )
    return report()
  }

  await check('state.json is written, pretty-printed, with all three keys', async () => {
    // Commands above have already forced at least one save.
    await new Promise((res) => setTimeout(res, 300))
    assert(fs.existsSync(STATE_FILE), `no state file at ${STATE_FILE}`)

    const raw = fs.readFileSync(STATE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    const keys = Object.keys(parsed).sort()

    assert(keys.includes('macros'), `state.json is missing macros (has ${keys})`)
    assert(keys.includes('screens'), `state.json is missing screens (has ${keys})`)
    assert(keys.includes('settings'), `state.json is missing settings (has ${keys})`)
    assert(raw.includes('\n  '), 'state.json is not pretty-printed with a 2-space indent')
  })

  return report()
}

/* ------------------------------------------------------------------ images */

/** One raw HTTP request, so a path like `/../x` reaches the server unnormalised. */
function rawRequest(base, method, rawPath, { headers = {}, body } = {}) {
  const url = new URL(base)
  return new Promise((resolve, reject) => {
    const req = http.request({ host: url.hostname, port: url.port, method, path: rawPath, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

async function imageChecks() {
  section('Custom macro images')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-images-'))
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-images-static-'))
  const env = {
    ...process.env,
    MACROTOUCH_STATIC_DIR: staticDir,
    MACROTOUCH_DATA_DIR: dir,
    MACROTOUCH_HTTP_PORT: String(port),
  }
  const child = spawn('node_modules/.bin/tsx', ['master-server/image-fixture.ts'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('image fixture did not start')), 8000)
      child.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('HTTP server started')) {
          clearTimeout(timer)
          resolve()
        }
      })
      child.once('exit', () => {
        clearTimeout(timer)
        reject(new Error('image fixture exited'))
      })
    })
    const token = JSON.parse(fs.readFileSync(path.join(dir, 'pairing.json'), 'utf-8')).token
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .find((i) => i && i.family === 'IPv4' && !i.internal)
    const remote = lan ? `http://${lan.address}:${port}` : null

    const upload = (body, type, root = base, query = '') =>
      fetch(`${root}/api/macro-image${query}`, { method: 'POST', headers: { 'content-type': type }, body })
    const bake = (id, span, crop, root = base, query = '') =>
      fetch(`${root}/api/macro-image/${id}/bake${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ span, crop }),
      })
    const ok = async (res) => {
      assert(res.status === 200, `expected 200, got ${res.status} ${await res.clone().text()}`)
      return res.json()
    }
    const bakedUrl = (id, b, root = base) => `${root}/macro-images/baked/${id}-${b.rev}.${b.ext}`
    const centre = { x: 0.5, y: 0.5, zoom: 1 }

    // A gradient, so that a different crop is a different picture. Half transparent, to check alpha survives.
    const pixels = Buffer.alloc(200 * 100 * 4)
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 200; x++) pixels.set([x, y * 2, (x + y) % 256, 128], (y * 200 + x) * 4)
    }
    const png = await sharp(pixels, { raw: { width: 200, height: 100, channels: 4 } })
      .png()
      .toBuffer()
    const frames = 3
    const frame = (n) => Buffer.alloc(40 * 30 * 4, 0).fill(Buffer.from([n * 100, 50, 200, 255]))
    const gif = await sharp(Buffer.concat([0, 1, 2].map(frame)), {
      raw: { width: 40, height: 30 * frames, channels: 4, pageHeight: 30 },
    })
      .gif({ loop: 0, delay: [100, 100, 100] })
      .toBuffer()
    const evilSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 50" onload="alert(1)">
      <script>alert(1)</script>
      <rect width="100" height="50" fill="red" onclick="alert(2)"/>
      <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
      <a xlink:href="javascript:alert(3)"><circle r="5" cx="10" cy="10"/></a>
      <image href="http://evil.example/x.png" width="10" height="10"/>
      <style>@import url(http://evil.example/a.css); rect { fill: url(http://evil.example/p) }</style>
    </svg>`

    let pngInfo
    await check('a PNG is stored as uploaded and described', async () => {
      pngInfo = await ok(await upload(png, 'image/png'))
      assert(/^[0-9a-f-]{36}$/.test(pngInfo.id), `bad id ${pngInfo.id}`)
      assert(pngInfo.ext === 'png' && pngInfo.width === 200 && pngInfo.height === 100, JSON.stringify(pngInfo))
      assert(pngInfo.animated === false, 'a PNG is not animated')
      const stored = fs.readFileSync(path.join(dir, 'macro-images', 'originals', `${pngInfo.id}.png`))
      assert(stored.equals(png), 'the original was changed')
    })

    await check('the format comes from the bytes, not the declared type', async () => {
      const info = await ok(await upload(png, 'image/jpeg'))
      assert(info.ext === 'png', `expected png, got ${info.ext}`)
    })

    await check('formats that are not images, or not allowed, are refused', async () => {
      for (const [body, type] of [
        [Buffer.from('just some text'), 'image/png'],
        [Buffer.from('BM\0\0\0\0\0\0\0\0\0\0'), 'image/bmp'],
        [png, 'application/pdf'],
        [Buffer.from('%PDF-1.4 hello'), 'image/png'],
        [Buffer.from('<html><script>alert(1)</script></html>'), 'image/svg+xml'],
        [Buffer.alloc(0), 'image/png'],
      ]) {
        const res = await upload(body, type)
        assert(res.status === 415 || res.status === 400, `expected 4xx for ${type}, got ${res.status}`)
      }
    })

    await check('a truncated image with valid magic bytes is refused', async () => {
      const res = await upload(png.subarray(0, 40), 'image/png')
      assert(res.status === 400, `expected 400, got ${res.status}`)
    })

    await check('an upload over the byte limit is refused with 413', async () => {
      const big = Buffer.alloc(10 * 1024 * 1024 + 1)
      png.copy(big)
      const res = await rawRequest(base, 'POST', '/api/macro-image', {
        headers: { 'content-type': 'image/png', 'content-length': String(big.length) },
        body: big,
      }).catch((err) => ({ status: 0, error: err }))
      assert(res.status === 413, `expected 413, got ${res.status} ${res.error?.message ?? ''}`)
    })

    await check('an image with too many pixels is refused', async () => {
      const huge = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: '#fff' } })
        .png({ compressionLevel: 9 })
        .toBuffer()
      assert(huge.length < 10 * 1024 * 1024, 'fixture itself is too large')
      const res = await upload(huge, 'image/png')
      assert(res.status === 413 || res.status === 400, `expected refusal, got ${res.status}`)
    })

    let svgInfo
    await check('an SVG is sanitised: scripts, handlers, foreignObject and external references are gone', async () => {
      svgInfo = await ok(await upload(evilSvg, 'image/svg+xml'))
      assert(svgInfo.ext === 'svg' && svgInfo.width === 100 && svgInfo.height === 50, JSON.stringify(svgInfo))
      const stored = fs.readFileSync(path.join(dir, 'macro-images', 'originals', `${svgInfo.id}.svg`), 'utf-8')
      for (const bad of [
        /<script/i,
        /onload/i,
        /onclick/i,
        /foreignObject/i,
        /javascript:/i,
        /evil\.example/i,
        /@import/i,
      ]) {
        assert(!bad.test(stored), `still contains ${bad}: ${stored}`)
      }
      assert(/viewBox="0 0 100 50"/.test(stored), `viewBox lost: ${stored}`)
      assert(/<(rect|path)/.test(stored), 'the drawing itself was removed')
    })

    await check('a baked SVG stays a vector, cropped by viewBox, with safe headers', async () => {
      const b = await ok(await bake(svgInfo.id, { rows: 1, columns: 1 }, { x: 0.5, y: 0.5, zoom: 2 }))
      assert(b.ext === 'svg', `expected svg, got ${b.ext}`)
      const res = await fetch(bakedUrl(svgInfo.id, b))
      const text = await res.text()
      assert(res.status === 200 && res.headers.get('content-type') === 'image/svg+xml', 'wrong response')
      assert(/viewBox="37\.5 12\.5 25 25"/.test(text), `unexpected viewBox: ${text}`)
      assert(!/<script|onload/i.test(text), 'script in baked SVG')
      assert(res.headers.get('content-security-policy')?.includes("default-src 'none'"), 'missing CSP')
      assert(res.headers.get('content-security-policy')?.includes('sandbox'), 'CSP is not sandboxed')
      assert(res.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff')
    })

    let b11
    await check('a raster bakes to WebP with immutable caching, CORS and nosniff', async () => {
      b11 = await ok(await bake(pngInfo.id, { rows: 1, columns: 1 }, centre))
      assert(b11.ext === 'webp' && /^[0-9a-f]{8,64}$/.test(b11.rev), JSON.stringify(b11))
      const res = await fetch(bakedUrl(pngInfo.id, b11))
      const bytes = Buffer.from(await res.arrayBuffer())
      assert(res.status === 200 && res.headers.get('content-type') === 'image/webp', 'wrong type')
      assert(
        res.headers.get('cache-control') === 'public, max-age=31536000, immutable',
        res.headers.get('cache-control'),
      )
      assert(res.headers.get('access-control-allow-origin') === '*', 'no CORS')
      assert(res.headers.get('x-content-type-options') === 'nosniff', 'no nosniff')
      const meta = await sharp(bytes).metadata()
      assert(meta.format === 'webp' && meta.hasAlpha, 'not a WebP with alpha')
      const head = await fetch(bakedUrl(pngInfo.id, b11), { method: 'HEAD' })
      assert(head.status === 200 && (await head.text()) === '', 'HEAD should answer with no body')
    })

    await check('the baked aspect always matches the span', async () => {
      for (const span of [
        { rows: 1, columns: 2 },
        { rows: 2, columns: 3 },
        { rows: 3, columns: 1 },
        { rows: 3, columns: 3 },
      ]) {
        const b = await ok(await bake(pngInfo.id, span, { x: 0.3, y: 0.7, zoom: 1.5 }))
        const meta = await sharp(Buffer.from(await (await fetch(bakedUrl(pngInfo.id, b))).arrayBuffer())).metadata()
        assert(
          meta.width * span.rows === meta.height * span.columns,
          `${span.rows}x${span.columns} baked to ${meta.width}x${meta.height}`,
        )
        assert(Math.max(meta.width, meta.height) <= 512, 'baked larger than the longest edge limit')
      }
    })

    await check('a different crop gives a different rev, the same crop the same one', async () => {
      const again = await ok(await bake(pngInfo.id, { rows: 1, columns: 1 }, centre))
      assert(again.rev === b11.rev, 'the same crop changed rev')
      const zoomed = await ok(await bake(pngInfo.id, { rows: 1, columns: 1 }, { x: 0.5, y: 0.5, zoom: 2 }))
      const moved = await ok(await bake(pngInfo.id, { rows: 1, columns: 1 }, { x: 0.1, y: 0.5, zoom: 1 }))
      const wide = await ok(await bake(pngInfo.id, { rows: 1, columns: 2 }, centre))
      assert(
        new Set([b11.rev, zoomed.rev, moved.rev, wide.rev]).size === 4,
        `crops collided: ${[b11.rev, zoomed.rev, moved.rev, wide.rev]}`,
      )
    })

    await check('bad spans, crops and ids are refused', async () => {
      assert((await bake(pngInfo.id, { rows: 0, columns: 2 }, centre)).status === 400, 'span with 0 rows accepted')
      assert((await bake(pngInfo.id, { rows: 1.5, columns: 2 }, centre)).status === 400, 'fractional span accepted')
      assert((await bake(pngInfo.id, { rows: 65, columns: 1 }, centre)).status === 400, 'oversized span accepted')
      assert((await bake(pngInfo.id, { rows: 1, columns: 1 }, { x: 'a', y: 0, zoom: 1 })).status === 400, 'string crop')
      assert((await bake(pngInfo.id, { rows: 1, columns: 1 }, { x: 0, y: 0, zoom: null })).status === 400, 'null zoom')
      assert(
        (await bake('00000000-0000-4000-8000-000000000000', { rows: 1, columns: 1 }, centre)).status === 404,
        'unknown image',
      )
      assert((await bake('not-an-id', { rows: 1, columns: 1 }, centre)).status === 404, 'bad id')
      const wild = await ok(await bake(pngInfo.id, { rows: 1, columns: 1 }, { x: 9, y: -4, zoom: 0.1 }))
      assert(wild.rev, 'out of range numbers should be clamped, not refused')
    })

    await check('an animated GIF stays animated when baked (multi-page WebP, right shape)', async () => {
      const info = await ok(await upload(gif, 'image/gif'))
      assert(
        info.ext === 'gif' && info.animated === true && info.width === 40 && info.height === 30,
        JSON.stringify(info),
      )
      const b = await ok(await bake(info.id, { rows: 1, columns: 2 }, centre))
      assert(b.ext === 'webp', 'animated GIF should bake to WebP')
      const bytes = Buffer.from(await (await fetch(bakedUrl(info.id, b))).arrayBuffer())
      const meta = await sharp(bytes, { animated: true }).metadata()
      assert(meta.pages === frames, `expected ${frames} frames, got ${meta.pages}`)
      assert(meta.width === meta.pageHeight * 2, `frame is ${meta.width}x${meta.pageHeight}, not 2:1`)
      assert(meta.delay?.length === frames, 'frame delays were lost')
    })

    await check('a GIF with too many frames is refused', async () => {
      const many = await sharp(
        Buffer.from(Array.from({ length: 8 * 8 * 4 * 201 }, (_, i) => (i * 7 + (i >> 8) * 31) % 256)),
        {
          raw: { width: 8, height: 8 * 201, channels: 4, pageHeight: 8 },
        },
      )
        .gif({ loop: 0, delay: Array(201).fill(10) })
        .toBuffer()
      const res = await upload(many, 'image/gif')
      assert(res.status === 413, `expected 413, got ${res.status} ${await res.text()}`)
    })

    await check('originals are served to the editor with safe headers', async () => {
      const res = await fetch(`${base}${'/macro-images/originals/' + svgInfo.id}`)
      assert(res.status === 200 && res.headers.get('content-type') === 'image/svg+xml', `got ${res.status}`)
      assert(res.headers.get('x-content-type-options') === 'nosniff', 'no nosniff')
      assert(res.headers.get('content-security-policy')?.includes('sandbox'), 'no CSP')
      assert(res.headers.get('access-control-allow-origin') === '*', 'no CORS')
      const png2 = await fetch(`${base}/macro-images/originals/${pngInfo.id}`)
      assert(png2.headers.get('content-type') === 'image/png', 'wrong type for png original')
    })

    await check('the editor routes answer a cross-origin preflight', async () => {
      const res = await fetch(`${base}/api/macro-image`, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:4323',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-pairing-token',
        },
      })
      assert(res.status === 204, `expected 204, got ${res.status}`)
      const allowed = res.headers.get('access-control-allow-headers') ?? ''
      assert(/content-type/i.test(allowed) && /x-pairing-token/i.test(allowed), `headers not allowed: ${allowed}`)
      assert(res.headers.get('access-control-allow-origin') === '*', 'no allow-origin')
      assert(/POST/.test(res.headers.get('access-control-allow-methods') ?? ''), 'POST not allowed')
    })

    await check('a web page from another site cannot use the loopback exemption', async () => {
      const res = await fetch(`${base}/api/macro-image`, {
        method: 'POST',
        headers: { 'content-type': 'image/png', origin: 'https://evil.example' },
        body: png,
      })
      assert(res.status === 401, `expected 401, got ${res.status}`)
      const withToken = await fetch(`${base}/api/macro-image`, {
        method: 'POST',
        headers: { 'content-type': 'image/png', origin: 'https://evil.example', 'x-pairing-token': token },
        body: png,
      })
      assert(withToken.status === 200, 'a token should still work')
    })

    await check('path traversal and malformed names never reach the file system', async () => {
      const paths = [
        '/macro-images/baked/../../pairing.json',
        '/macro-images/baked/..%2f..%2fpairing.json',
        '/macro-images/baked/%2e%2e/%2e%2e/state.json',
        `/macro-images/baked/${pngInfo.id}-${b11.rev}.webp/../../../pairing.json`,
        `/macro-images/baked/${pngInfo.id}-${b11.rev}.png`,
        `/macro-images/baked/${pngInfo.id}.webp`,
        '/macro-images/baked/',
        '/macro-images/originals/..%2fbaked',
        '/macro-images/originals/../../pairing.json',
        `/macro-images/originals/${pngInfo.id}.png`,
        '/macro-images/originals/',
        '/macro-images/nothing',
        '/macro-images/',
      ]
      for (const p of paths) {
        const res = await rawRequest(base, 'GET', p)
        assert([400, 403, 404].includes(res.status), `${p} -> ${res.status}`)
        assert(!res.body.toString().includes(token), `${p} leaked the token`)
      }
      const res = await rawRequest(base, 'POST', '/api/macro-image/..%2f..%2fx/bake', {
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      assert(res.status === 404, `bake with a traversal id -> ${res.status}`)
    })

    if (!remote) {
      skip('devices other than this computer need the token', 'no non-loopback IPv4 address on this machine')
    } else {
      await check('another device without the token cannot upload, bake or read originals', async () => {
        assert((await upload(png, 'image/png', remote)).status === 401, 'upload allowed')
        assert((await bake(pngInfo.id, { rows: 1, columns: 1 }, centre, remote)).status === 401, 'bake allowed')
        assert((await fetch(`${remote}/macro-images/originals/${pngInfo.id}`)).status === 401, 'original served')
        assert(
          (await fetch(`${remote}/macro-images/originals/${pngInfo.id}?token=wrong`)).status === 401,
          'wrong token accepted',
        )
      })

      await check('another device with the token can, by query or header', async () => {
        const viaQuery = await ok(await upload(png, 'image/png', remote, `?token=${token}`))
        assert(viaQuery.ext === 'png', 'upload by query token failed')
        const res = await fetch(`${remote}/api/macro-image/${viaQuery.id}/bake`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-pairing-token': token },
          body: JSON.stringify({ span: { rows: 1, columns: 1 }, crop: centre }),
        })
        assert((await ok(res)).ext === 'webp', 'bake by header token failed')
        const original = await fetch(`${remote}/macro-images/originals/${viaQuery.id}`, {
          headers: { 'x-pairing-token': token },
        })
        assert(original.status === 200, `original with token: ${original.status}`)
      })

      await check('baked images are open to every device', async () => {
        const res = await fetch(bakedUrl(pngInfo.id, b11, remote))
        assert(res.status === 200, `expected 200, got ${res.status}`)
      })
    }

    await check('unused images are cleaned up, used ones and their current bake kept', async () => {
      const used = await ok(await upload(png, 'image/png'))
      const old = await ok(await bake(used.id, { rows: 1, columns: 1 }, centre))
      const current = await ok(await bake(used.id, { rows: 1, columns: 1 }, { x: 0.2, y: 0.5, zoom: 1 }))
      const out = await new Promise((resolve, reject) => {
        const gc = spawn('node_modules/.bin/tsx', ['master-server/image-fixture.ts'], {
          env: {
            ...env,
            MODE: 'gc',
            IMAGE_GC_GRACE_MS: '0',
            KEEP_IDS: used.id,
            KEEP_BAKES: `${used.id}-${current.rev}`,
          },
          stdio: ['ignore', 'pipe', 'inherit'],
        })
        let text = ''
        gc.stdout.on('data', (c) => (text += c))
        gc.on('error', reject)
        gc.on('exit', () => resolve(text))
      })
      const left = JSON.parse(out.trim().split('\n').pop())
      assert(left.originals.length === 1 && left.originals[0].startsWith(used.id), `originals left: ${left.originals}`)
      assert(left.baked.length === 1 && left.baked[0] === `${used.id}-${current.rev}.webp`, `baked left: ${left.baked}`)
      assert(old.rev !== current.rev, 'fixture bakes should differ')
    })

    await check('files younger than the grace period survive cleanup', async () => {
      const fresh = await ok(await upload(png, 'image/png'))
      const gc = spawn('node_modules/.bin/tsx', ['master-server/image-fixture.ts'], {
        env: { ...env, MODE: 'gc', IMAGE_GC_GRACE_MS: String(10 * 60 * 1000) },
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      let text = ''
      gc.stdout.on('data', (c) => (text += c))
      await new Promise((resolve) => gc.on('exit', resolve))
      assert(
        JSON.parse(text.trim().split('\n').pop()).originals.some((n) => n.startsWith(fresh.id)),
        'fresh upload deleted',
      )
    })
  } finally {
    child.kill()
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(staticDir, { recursive: true, force: true })
  }
}

/* -------------------------------------------------------------------- report */

function report() {
  for (const s of sockets) {
    try {
      s.close()
    } catch {
      // Closing a socket the server already dropped is fine.
    }
  }

  const failed = results.filter((r) => !r.ok)
  const skipped = results.filter((r) => r.skipped).length
  console.log(
    `\n${results.length - failed.length - skipped}/${results.length - skipped} checks passed` +
      (skipped ? `, ${skipped} skipped` : ''),
  )

  if (skipped) {
    console.log('\nSkipped checks are not passes. Re-run with MACROTOUCH_DATA_DIR set to an empty')
    console.log('directory, matching the server under test, to cover them.')
  }

  if (failed.length) {
    console.log('\nFailures:')
    for (const f of failed) console.log(`  ${f.group} → ${f.name}\n    ${f.error}`)
  }

  process.exit(failed.length ? 1 : 0)
}

main().catch((err) => {
  console.error('\nHarness could not run:', err.message)
  console.error(`Is the server up? Expected a websocket at ${WS_URL}.`)
  process.exit(2)
})
