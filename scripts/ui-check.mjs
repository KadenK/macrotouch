#!/usr/bin/env node
/**
 * UI harness for the regression checklist, driving the **packaged** app.
 *
 * Playwright launches the built Electron binary directly, so this exercises the
 * real shell, the real master and the real action server — not a dev server.
 * It covers the checklist items a browser can reach: ST, SC, MC, SE, PA and RT.
 * The wire-level items live in `protocol-check.mjs`; the two are complementary.
 *
 * Build first, then run it — it finds the binary under dist-electron/ and uses
 * a throwaway data directory, so your own ~/.macroTouch is never touched:
 *
 *   npm run dist
 *   npm run test:ui
 *
 * APP_BIN and DATA_DIR override either default if you need them to.
 *
 * Exits non-zero if any check fails.
 */

import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const BASE = 'http://127.0.0.1:4321'

/** The packaged binary, wherever electron-builder put it for this platform. */
function findApp() {
  const out = 'dist-electron'
  if (!fs.existsSync(out)) return null
  const candidates = []
  for (const dir of fs.readdirSync(out)) {
    candidates.push(
      path.join(out, dir, 'MacroTouch.app/Contents/MacOS/MacroTouch'), // mac
      path.join(out, dir, 'MacroTouch'), // linux
      path.join(out, dir, 'MacroTouch.exe'), // windows
    )
  }
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null
}

/** The app reuses a master that is already up, and its stale state fails checks for the wrong reason. */
function portFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(true))
    socket.setTimeout(500, () => {
      socket.destroy()
      resolve(true)
    })
  })
}

const APP = process.env.APP_BIN || findApp()
if (!APP) {
  console.error('No packaged app found under dist-electron/. Run `npm run dist` first, or set APP_BIN.')
  process.exit(2)
}
for (const port of [4321, 4322]) {
  if (!(await portFree(port))) {
    console.error(`Something is already listening on ${port}. Quit any running MacroTouch or master first:`)
    console.error('  pkill -f "MacroTouch.app/Contents/MacOS/MacroTouch"; pkill -f dist-master/index.mjs')
    process.exit(2)
  }
}

const DATA = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'mt-ui-'))
const MARKER = process.env.MARKER || path.join(DATA, 'ui-check-marker')
console.log(`app       → ${APP}`)
console.log(`data dir  → ${DATA}`)

const results = []
const sec = (n) => console.log(`\n${n}`)
const assert = (c, m) => {
  if (!c) throw new Error(m)
}

async function check(id, desc, fn) {
  try {
    if (win) {
      await closeModals()
      dialogAction = 'dismiss'
      lastDialog = ''
    }
  } catch {
    /* pre-clean */
  }
  try {
    await fn()
    results.push({ id, ok: true })
    console.log(`  ok    ${id} — ${desc}`)
  } catch (e) {
    results.push({ id, ok: false, err: e.message })
    console.log(`  FAIL  ${id} — ${desc}\n        ${e.message}`)
  }
}
function skip(id, desc, why) {
  results.push({ id, skip: true })
  console.log(`  skip  ${id} — ${desc}\n        ${why}`)
}

async function until(fn, msg, timeout = 6000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try {
      if (await fn()) return
    } catch (e) {
      last = e
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(msg + (last ? ` (${last.message})` : ''))
}

let app, win
let dialogAction = 'dismiss'
let lastDialog = ''
async function launch() {
  app = await electron.launch({ executablePath: APP, env: { ...process.env, MACROTOUCH_DATA_DIR: DATA } })
  win = await app.firstWindow()
  win.setDefaultTimeout(8000)
  win.on('dialog', async (d) => {
    lastDialog = d.message()
    try {
      dialogAction === 'accept' ? await d.accept() : await d.dismiss()
    } catch {
      /* already handled */
    }
  })
  await win.waitForLoadState('domcontentloaded')
  await win.waitForSelector('.screen-controls, .empty-state', { timeout: 25000 })
  await win.waitForTimeout(800)
}

/** Modals are stacked and have no Escape handler; close from the top down. */
async function closeModals() {
  for (let i = 0; i < 6 && (await win.locator('.modal-overlay').count()); i++) {
    const close = win.locator('.modal-overlay .modal-close-btn').last()
    if (await close.count()) await close.click({ force: true, timeout: 2000 }).catch(() => {})
    else break
    await win.waitForTimeout(250)
  }
}
const goto = async (p) => {
  await win.goto(BASE + p)
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(700)
}

const cells = () => win.locator('.grid-item')
const title = () => win.locator('.modal-title').innerText()
const screenNames = async () => win.locator('select.screen-select option').allInnerTexts()

async function makeMacro(cellIndex, name, actionLabel, params) {
  await cells().nth(cellIndex).locator('button.macro.edit').click()
  await win.waitForSelector('.modal-container')
  await win.locator('.edit-form input[type=text]').first().fill(name)
  if (actionLabel) {
    await win.locator('.edit-form select').first().selectOption({ label: actionLabel })
    await win.waitForTimeout(200)
    if (params)
      for (const [i, v] of params.entries())
        await win
          .locator('.edit-form input[type=text]')
          .nth(i + 1)
          .fill(v)
  }
  await win.locator('.save-btn').click()
  await until(async () => !(await win.locator('.modal-container').count()), 'macro modal did not close')
}

/* ------------------------------------------------------------------ run */
process.on('uncaughtException', async (e) => {
  console.error('UNCAUGHT', e.message)
  await app?.close().catch(() => {})
  process.exit(1)
})
process.on('unhandledRejection', async (e) => {
  console.error('UNHANDLED', e?.message)
  await app?.close().catch(() => {})
  process.exit(1)
})
await launch()

sec('A. Startup (ST)')
await check('ST-01', 'cold start creates one default screen, no error dialog', async () => {
  const names = await screenNames()
  assert(
    names.length === 1 && names[0] === 'Screen',
    `expected one screen named "Screen", got ${JSON.stringify(names)}`,
  )
  assert((await cells().count()) === 15, `expected default 3x5 = 15 cells, got ${await cells().count()}`)
  assert(fs.existsSync(DATA), 'data directory was not created')
})

sec('C. Screens (SC)')
await check('SC-01', 'Add Screen opens "Create Screen" and saving selects it', async () => {
  await win.locator('button.btn-primary').click()
  await win.waitForSelector('.modal-container')
  assert((await title()) === 'Create Screen', `modal title was "${await title()}"`)
  await win.locator('.edit-form input[type=text]').fill('Second')
  await win.locator('.save-btn').click()
  await until(async () => (await screenNames()).includes('Second'), 'new screen never appeared')
  assert((await win.locator('select.screen-select').inputValue()) !== '', 'no screen selected after save')
})
await check('SC-02', 'new screen uses the default grid size and background', async () => {
  assert((await cells().count()) === 15, `expected 15 cells from default 3x5, got ${await cells().count()}`)
  await win.locator('button.btn-secondary').click()
  await win.waitForSelector('.modal-container')
  const bg = await win.locator('.edit-form input[type=color]').nth(0).inputValue()
  assert(bg.toLowerCase() === '#f0f0f0', `default background was ${bg}`)
  await win.locator('.cancel-btn').click()
})
await check('SC-03', 'Edit Current Screen opens "Edit Screen" pre-filled', async () => {
  await win.locator('button.btn-secondary').click()
  await win.waitForSelector('.modal-container')
  assert((await title()) === 'Edit Screen', `modal title was "${await title()}"`)
  const name = await win.locator('.edit-form input[type=text]').inputValue()
  assert(name === 'Second', `name field was "${name}"`)
  await win.locator('.cancel-btn').click()
})
await check('SC-04', 'grid size 0 and 99 clamp into 1..20', async () => {
  await win.locator('button.btn-secondary').click()
  await win.waitForSelector('.modal-container')
  await win.locator('.edit-form input.number-input').nth(0).fill('0')
  await win.locator('.edit-form input.number-input').nth(1).fill('99')
  await win.locator('.save-btn').click()
  await until(async () => (await cells().count()) === 20, `expected 1x20 = 20 cells, got ${await cells().count()}`)
  await win.locator('button.btn-secondary').click()
  await win.waitForSelector('.modal-container')
  const r = await win.locator('.edit-form input.number-input').nth(0).inputValue()
  const c = await win.locator('.edit-form input.number-input').nth(1).inputValue()
  assert(r === '1' && c === '20', `clamped to ${r}x${c}`)
  await win.locator('.cancel-btn').click()
})
await check('SC-05', 'growing a grid preserves existing macros', async () => {
  await makeMacro(0, 'Keep Me')
  await until(async () => (await cells().nth(0).locator('.macro-label').innerText()) === 'Keep Me', 'macro not placed')
  await win.locator('button.btn-secondary').click()
  await win.waitForSelector('.modal-container')
  await win.locator('.edit-form input.number-input').nth(0).fill('3')
  await win.locator('.save-btn').click()
  await until(async () => (await cells().count()) === 60, `expected 3x20 = 60 cells, got ${await cells().count()}`)
  const label = await cells().nth(0).locator('.macro-label').innerText()
  assert(label === 'Keep Me', `macro in cell 0 is now "${label}"`)
})
await check('SC-10', 'dropdown lists every screen and switching swaps the grid', async () => {
  const names = await screenNames()
  assert(names.join(',') === 'Screen,Second', `dropdown shows ${JSON.stringify(names)}`)
  const sel = win.locator('select.screen-select')
  const ids = await sel.locator('option').evaluateAll((os) => os.map((o) => o.value))
  await sel.selectOption(ids[0])
  await until(async () => (await cells().count()) === 15, 'grid did not swap to the first screen')
  await sel.selectOption(ids[1])
  await until(async () => (await cells().count()) === 60, 'grid did not swap back')
})
await check('SC-07', 'delete prompts with a confirm naming the screen; cancel keeps it', async () => {
  dialogAction = 'dismiss'
  await win.locator('button.btn-secondary').click()
  await win.waitForSelector('.modal-container')
  await win.locator('.delete-btn').click()
  await win.waitForTimeout(600)
  assert(lastDialog.includes('Second'), `confirm message did not name the screen: "${lastDialog}"`)
  assert((await screenNames()).includes('Second'), 'screen was deleted despite cancelling')
  if (await win.locator('.modal-container').count()) await win.locator('.cancel-btn').click()
})
await check('SC-08/SC-09', 'confirming deletes the screen, its macros, and selects the first remaining', async () => {
  dialogAction = 'accept'
  await win.locator('button.btn-secondary').click()
  await win.waitForSelector('.modal-container')
  await win.locator('.delete-btn').click()
  await until(async () => !(await screenNames()).includes('Second'), 'screen was not deleted')
  const names = await screenNames()
  assert(names.length === 1 && names[0] === 'Screen', `remaining screens: ${JSON.stringify(names)}`)
  await until(async () => (await cells().count()) === 15, 'first remaining screen was not selected')
})

sec('D. Macros (MC)')
await check('MC-01', 'tapping an empty cell opens "Create Macro" pre-filled', async () => {
  await cells().nth(2).locator('button.macro.edit').click()
  await win.waitForSelector('.modal-container')
  assert((await title()) === 'Create Macro', `modal title was "${await title()}"`)
  const n = await win.locator('.edit-form input[type=text]').first().inputValue()
  assert(n === 'New Macro', `name pre-filled as "${n}"`)
  await win.locator('.cancel-btn').click()
})
await check('MC-02', 'a saved macro lands in the tapped cell', async () => {
  await makeMacro(2, 'Cell Two')
  await until(
    async () => (await cells().nth(2).locator('.macro-label').innerText()) === 'Cell Two',
    'macro not in cell 2',
  )
  const other = await cells().nth(0).locator('.macro-label').innerText()
  assert(other === 'Empty', `cell 0 unexpectedly holds "${other}"`)
})
await check('MC-03', 'tapping a filled cell opens "Edit Macro" with its values', async () => {
  await cells().nth(2).locator('button.macro.edit').click()
  await win.waitForSelector('.modal-container')
  assert((await title()) === 'Edit Macro', `modal title was "${await title()}"`)
  const n = await win.locator('.edit-form input[type=text]').first().inputValue()
  assert(n === 'Cell Two', `name was "${n}"`)
  await win.locator('.cancel-btn').click()
})
await check('MC-04', 'the icon picker opens, searches, and updates the preview', async () => {
  await cells().nth(2).locator('button.macro.edit').click()
  await win.waitForSelector('.modal-container')
  await win.locator('.small-btn').click()
  const picker = win.locator('.modal-container', { has: win.locator('.modal-title', { hasText: 'Select an Icon' }) })
  await picker.waitFor({ timeout: 8000 })
  const search = picker.locator('.modal-search input')
  assert(await search.count(), 'icon picker has no search input')
  await search.fill('star')
  await win.waitForTimeout(1500)
  const items = picker.locator('.icon-item')
  const n = await items.count()
  assert(n > 0, 'icon search for "star" returned no results')
  const chosen = await items.first().getAttribute('title')
  await items.first().click({ timeout: 5000 })
  await until(async () => !(await picker.count()), 'icon picker did not close after selecting')
  const preview = win.locator('.icon-preview .preview-icon')
  assert((await preview.count()) > 0, 'macro modal lost its icon preview')
  console.log(`        (searched "star", ${n} results, picked ${chosen})`)
  await closeModals()
})
await check('MC-06', 'switching the action type replaces the parameter fields', async () => {
  await cells().nth(2).locator('button.macro.edit').click()
  await win.waitForSelector('.modal-container')
  const select = win.locator('.edit-form select').first()
  await select.selectOption({ label: 'Shell Command' })
  await win.waitForTimeout(300)
  const shellFields = await win.locator('.edit-form label').allInnerTexts()
  assert(shellFields.includes('Command'), `Shell Command fields were ${JSON.stringify(shellFields)}`)
  await select.selectOption({ label: 'Send Notification' })
  await win.waitForTimeout(300)
  const notifyFields = await win.locator('.edit-form label').allInnerTexts()
  assert(!notifyFields.includes('Command'), 'the Command field survived a change of action type')
  assert(notifyFields.includes('Title'), `Send Notification fields were ${JSON.stringify(notifyFields)}`)
  await win.locator('.cancel-btn').click()
})
await check('MC-08', 'deleting a macro prompts and empties the cell', async () => {
  dialogAction = 'accept'
  await cells().nth(2).locator('button.macro.edit').click()
  await win.waitForSelector('.modal-container')
  await win.locator('.delete-btn').click()
  await until(
    async () => (await cells().nth(2).locator('.macro-label').innerText()) === 'Empty',
    'cell was not emptied',
  )
})
skip(
  'MC-10/MC-11',
  'move a macro between cells',
  'not reachable: no UI calls moveMacro() — same as the master baseline',
)

sec('H. Settings (SE)')
await check('SE-01', 'the page reflects stored settings', async () => {
  await win.locator('.input-button', { hasText: 'Settings' }).click()
  await until(async () => win.url().endsWith('/settings'), 'did not navigate to /settings')
  await win.waitForSelector('.settings-page')
  const rows = await win.locator('.grid-input').nth(0).inputValue()
  const cols = await win.locator('.grid-input').nth(1).inputValue()
  assert(rows === '3' && cols === '5', `settings show ${rows}x${cols}, expected 3x5`)
})
await check('SE-03', 'Cancel resets the fields but stays on the page', async () => {
  await win.locator('.grid-input').nth(0).fill('7')
  await win.locator('.cancel-btn').click()
  await win.waitForTimeout(400)
  assert(win.url().endsWith('/settings'), `Cancel navigated to ${win.url()}`)
  const rows = await win.locator('.grid-input').nth(0).inputValue()
  assert(rows === '3', `field reset to ${rows}, expected 3`)
})
await check('SE-05/SE-02', 'rows/columns clamp to 1..20 on save, then it navigates to /home', async () => {
  await win.locator('.grid-input').nth(0).fill('99')
  await win.locator('.grid-input').nth(1).fill('0')
  await win.locator('.save-btn').click()
  await until(async () => win.url().endsWith('/home'), `Save did not navigate home (at ${win.url()})`)
  await win.locator('.input-button', { hasText: 'Settings' }).click()
  await win.waitForSelector('.settings-page')
  const rows = await win.locator('.grid-input').nth(0).inputValue()
  const cols = await win.locator('.grid-input').nth(1).inputValue()
  assert(rows === '20' && cols === '1', `clamped to ${rows}x${cols}, expected 20x1`)
})
await check('SE-10', 'the four decorative toggles do not persist', async () => {
  const boxes = win.locator('.setting-row input[type=checkbox]')
  await win.locator('.setting-row .switch').nth(0).click()
  assert(await boxes.nth(0).isChecked(), 'clicking the switch did not tick the box')
  await win.locator('.save-btn').click()
  await until(async () => win.url().endsWith('/home'), 'save did not navigate')
  await win.locator('.input-button', { hasText: 'Settings' }).click()
  await win.waitForSelector('.settings-page')
  const still = await win.locator('.setting-row input[type=checkbox]').nth(0).isChecked()
  assert(!still, 'Start on boot persisted — it is documented as inert')
})
await check('SE-08', 'Swipe to change screens persists', async () => {
  const swipe = win.locator('.setting-row input[type=checkbox]').nth(3)
  const before = await swipe.isChecked()
  await win.locator('.setting-row .switch').nth(3).click()
  await until(async () => (await swipe.isChecked()) === !before, 'swipe toggle did not flip')
  await win.locator('.save-btn').click()
  await until(async () => win.url().endsWith('/home'), 'save did not navigate')
  await win.locator('.input-button', { hasText: 'Settings' }).click()
  await win.waitForSelector('.settings-page')
  const after = await win.locator('.setting-row input[type=checkbox]').nth(3).isChecked()
  assert(after === !before, `swipe toggle did not persist (was ${before}, now ${after})`)
  if ((await win.locator('.setting-row input[type=checkbox]').nth(3).isChecked()) !== before) {
    await win.locator('.setting-row .switch').nth(3).click()
  }
  await win.locator('.save-btn').click()
  await until(async () => win.url().endsWith('/home'), 'restore did not navigate')
})

sec('E. Pairing (PA)')
await check('PA-01/PA-04/PA-05', 'connect page lists interfaces with URLs and a QR on the selection', async () => {
  await win.locator('.input-button', { hasText: 'Connect' }).click()
  await until(async () => win.url().endsWith('/connect'), 'did not navigate to /connect')
  await win.waitForSelector('.connect-page')
  await win.waitForTimeout(1200)
  const empty = await win.locator('.status-empty').count()
  if (empty) {
    assert((await win.locator('.status-empty').innerText()).includes('No private LAN IPv4'), 'wrong empty text')
    return
  }
  const cards = win.locator('.interface-card')
  assert((await cards.count()) > 0, 'no interfaces listed')
  const url = (await cards.first().locator('a.link').innerText()).trim()
  assert(/^http:\/\/\d+\.\d+\.\d+\.\d+:4321\/screen$/.test(url), `URL shape was "${url}"`)
  console.log(`        (URL is ${url} — checklist PA-04 says "/", MAC-39 changed it to "/screen")`)
  assert((await win.locator('canvas, img[src^="data:image"], svg').count()) > 0, 'no QR rendered for the selected card')
})
await check('PA-09', 'local requests reach the editor', async () => {
  await goto('/')
  await until(async () => win.url().endsWith('/home'), `local / landed on ${win.url()} instead of /home`)
})

sec('F. Runtime screen (RT)')
await check('RT-05/RT-04', 'runtime taps never open the editor and empty cells are inert', async () => {
  await goto('/home')
  await makeMacro(0, 'Runner', 'Shell Command', [`touch "${MARKER}"`])
  await goto('/screen')
  await win.waitForSelector('.grid-item')
  await cells().nth(1).click()
  await win.waitForTimeout(400)
  assert((await win.locator('.modal-container').count()) === 0, 'an empty runtime cell opened a modal')
  await cells().nth(0).click()
  await win.waitForTimeout(400)
  assert((await win.locator('.modal-container').count()) === 0, 'tapping a runtime macro opened the edit modal')
})
await check('RT-01', 'tapping a macro on the runtime screen runs the action on the host', async () => {
  await until(() => fs.existsSync(MARKER), 'the shell action never ran', 8000)
})
await check('RT-12', 'runtime with zero screens renders blank with no message', async () => {
  await goto('/home')
  dialogAction = 'accept'
  await win.locator('button.btn-secondary').click()
  await win.waitForSelector('.modal-container')
  await win.locator('.delete-btn').click()
  await until(async () => (await win.locator('.empty-state').count()) > 0, 'editor did not reach the empty state')
  const text = await win.locator('.empty-state').innerText()
  assert(text.includes('No screens yet'), `editor empty state read "${text}"`)
  await goto('/screen')
  const blank = await win.locator('.empty-state').count()
  assert(blank === 1, `runtime with no screens rendered ${blank} empty-state elements`)
})

await app.close().catch(() => {})

const failed = results.filter((r) => r.ok === false)
const passed = results.filter((r) => r.ok === true)
const skipped = results.filter((r) => r.skip)
console.log(`\n${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`)
if (failed.length) {
  console.log('\nFailures:')
  for (const f of failed) console.log(`  ${f.id}: ${f.err}`)
}
process.exit(failed.length ? 1 : 0)
