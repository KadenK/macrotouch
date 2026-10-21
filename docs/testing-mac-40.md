# Testing MAC-40 — hello/snapshot and command/state-patch

How to verify the protocol migration on
[MAC-40](https://linear.app/macrotouch/issue/MAC-40/migrate-to-hellosnapshot-and-commandstate-patch-protocol).

Two passes. The harness covers the wire protocol, which no browser can reach; the manual pass
covers what the harness cannot see, which is whether the client actually renders what it is sent.

Budget roughly 2 minutes for the harness and 15 for the manual pass.

---

## 0. Isolate the data directory

Every step below writes to the state file. `resolveDataRoot()` checks `MACROTOUCH_DATA_DIR`
before `XDG_DATA_HOME` and `~/.macroTouch`, so exporting it keeps the run away from your real
state:

```bash
export MACROTOUCH_DATA_DIR=/tmp/mt-test
rm -rf /tmp/mt-test          # required for ST-02 — see below
npm run dev                  # Nuxt on :4321, websocket on :4322
```

Leave this running in its own terminal. Every command after this assumes `MACROTOUCH_DATA_DIR` is
exported in whichever shell you run it from.

> **Start from an empty directory.** The ST-02 check asserts that the *master* seeds `settings`
> with no client input. Against a data directory that already holds a `state.json`, it cannot tell
> a seeded default from a stored one, so it skips itself and says so.

---

## 1. Typecheck — seconds

```bash
npm run typecheck:protocol
```

Must be silent. This compiles `shared/` and `types/` with no Nuxt or Nitro context, which is what
keeps the protocol importable from the master and the future Action Server.

`npx nuxi typecheck` also runs, but reports 5 **pre-existing** errors in `app/pages/home.vue`,
`MacroEditModal.vue` and `IconPickerSearch.vue`. None of those files are touched by this branch.
Don't read them as a regression.

---

## 2. Protocol harness — 24 checks, ~2 seconds

```bash
npm run test:protocol
```

Exits non-zero on any failure, so it drops straight into CI when there is one. It speaks the
protocol directly over `ws` — already a dependency — so there is nothing to install.

The harness has no way to ask the server where it writes, so it will not guess: with
`MACROTOUCH_DATA_DIR` unset, the two persistence checks **skip** rather than reading whatever sits
in `~/.macroTouch`, which belongs to a different server than the one under test and would pass for
the wrong reason. A skip is not a pass, and the summary line says so.

It covers the behavior that is unreachable from the UI:

| Group | Checks |
| --- | --- |
| Handshake | no snapshot before `hello`; commands before `hello` rejected; `hello` → `snapshot`; `catalogs`/`actionState` **absent, not empty**; controller may send `screenId`; version mismatch closes the socket; a browser cannot claim `role: 'node'` |
| Commands and patches | patches are deltas; `placement` touches both maps; `delete-macro` sends a `null` tombstone; `move-macro`; `delete-screen` cascades; `update-settings` touches settings only; rows clamped and padded (SC-06) |
| Errors | malformed JSON; bad command shape; unknown type; `unknown-screen`; out-of-range position — each leaves the socket open |
| Sync | patch reaches every client including the sender (SY-02); **concurrent edits to different macros both survive (SY-06)** |
| Persistence | master seeds `settings` with no client input (ST-02); `state.json` written pretty-printed with all three keys |

**SY-06 is the point of the ticket**, and it is the one item that is genuinely hard to test by
hand: the old bug needed client B to send a whole state that predated client A's edit, and if
patches propagate quickly two humans clicking cannot open that window. The harness sends both
`upsert-macro` commands before either client has seen the other's patch, then confirms against a
fresh snapshot rather than trusting the patches alone.

### Confirming the harness can fail

A suite that passes on its first run has proved nothing yet. To see it fail on demand, reintroduce
the ST-02 regression — drop `settings` from `emptyState()` in `server/master/state-file.ts`:

```ts
return { macros: {}, screens: {} } as MacroState
```

Restart the server against an empty data directory and re-run. Expect:

```
FAIL  the master seeds settings with no client input (ST-02)
      the first snapshot carried no settings — the master is not seeding its own defaults
```

Then revert. This was run during the verification below and behaved exactly that way.

---

## 3. Manual UI pass — what the harness cannot see

The harness proves the master is correct. It says nothing about whether the client applies patches
and renders them. Open two editor windows on `http://localhost:4321/home`.

| Item | Do this | Expect |
| --- | --- | --- |
| SY-01 | Open a second window | Both render the same screens with no reload |
| SY-02 | Edit a macro's name in window 1 | Appears in window 2; window 1 also sees its own patch |
| SY-03 | Delete a macro | Disappears from both |
| SY-04 | Change a setting | Both windows pick it up |
| SC-06 ⚠ | Place a macro in the last column, then shrink the column count below it | UI renders the clamped grid **and** `state.json` agrees immediately — on master the file kept a stale wide row until a later edit |
| SC-07 / SC-08 | Delete a screen | `confirm()` names it; its macros go too |
| ST-03 | Restart the dev server, reload | State survives; `Loaded state from file` in the log |
| SY-05 ⚠ | Kill the server, try an edit | No reconnect, page reload required — unchanged on purpose |
| RT-01 | Tap a macro on `/screen` | Runs on the host only |
| RT-10 | Open `/screen` | Fullscreen hint shown, cleared by the next tap |

Watch the browser console while you do this. A `[protocol] <code>: <message>` warning means the
client sent something the master rejected, which under normal UI use should never happen.

For the Electron items (EL-*), use `npm run dev:electron`. MAC-40 did not touch Electron, but the
merge from master removed the notification server on `:4323`, so EL-03 and EL-05 changed
underneath this branch — `regression-checklist.md` is already updated for that.

---

## Verification run — 2026-10-20

| | |
| --- | --- |
| Branch | `khm45/mac-40-...` @ `ac71f2e` (after the merge from master) |
| Platform | macOS (darwin 25.6.0), Node v22.22.2 |
| Launch | `npm run dev`, `MACROTOUCH_DATA_DIR=/tmp/mt-test` |

- `npm run typecheck:protocol` — clean.
- `npm run test:protocol` — **24/24 passed**, exit 0.
- Negative control — reintroduced the ST-02 regression, confirmed the suite fails it and exits 1,
  then reverted.
- ST-03 by hand — restarted against the same data directory; the snapshot came back
  `macros=4 screens=9 settings=present`, matching `state.json` exactly, with
  `Loaded state from file` logged once.
- Server log carried the expected rejections and nothing else: `Message received before hello`,
  `Master speaks protocol 1, client sent 99`, `hello role must be editor or controller, got node`,
  `Message is not valid JSON`, `upsert-macro requires a macro with an id`,
  `Unknown message type: teleport-macro`, `No screen no-such-screen`, `Position 9,9 is outside
  screen ...`.

**Not yet run on this branch:** the manual UI pass in section 3, and anything under Electron. The
harness does not exercise the client at all, so section 3 is still required before merge.

### A note on the earlier baseline runs

`baseline-runs/2026-10-19-master-93e0004.md` and `2026-10-19-mac-40.md` were produced with a
Playwright harness that was **never committed** — there are no test files in the repo and no
Playwright dependency. Those documents can be read, but not reproduced. `scripts/protocol-check.mjs`
is the re-runnable replacement for their protocol half; their UI half is section 3 above, by hand.
