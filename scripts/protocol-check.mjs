#!/usr/bin/env node
/**
 * Protocol harness for the MAC-40 wire format (hello/snapshot, command/state-patch).
 *
 * Covers the behavior that no browser can reach: handshake ordering, version
 * mismatch, error replies, patch deltas, tombstones, and the SY-06 concurrent
 * edit that is the point of the ticket. Speaks the protocol directly over `ws`,
 * which the app already depends on, so there is nothing extra to install.
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
import path from 'node:path'

const WS_URL = process.env.WS_URL ?? 'ws://127.0.0.1:4322'
const PROTOCOL_VERSION = 1
const TIMEOUT = 2000

/**
 * The harness cannot ask the server where it writes, so it will not guess.
 * Without an explicit MACROTOUCH_DATA_DIR the file-level checks would read
 * whatever happens to sit in ~/.macroTouch — a different file than the server
 * under test is writing, which can pass for the wrong reason.
 */
const DATA_DIR = process.env.MACROTOUCH_DATA_DIR ?? null
const STATE_FILE = DATA_DIR ? path.join(DATA_DIR, 'state.json') : null

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
async function connect() {
  const c = await open()
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

  await check('snapshot omits catalogs and actionState entirely', async () => {
    const { snapshot } = await connected('editor')
    assert(!('catalogs' in snapshot), 'catalogs should be absent in Demo 1, not empty')
    assert(!('actionState' in snapshot), 'actionState should be absent in Demo 1, not empty')
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

  await check('a browser client cannot claim role: node', async () => {
    const c = await connect()
    c.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, role: 'node' })
    const msg = await c.next(isError)
    assert(msg.error.code === 'invalid-message', `expected invalid-message, got ${msg.error.code}`)
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
