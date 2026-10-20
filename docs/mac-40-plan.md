# MAC-40 — Migrate to hello/snapshot and command/state-patch

Implementation plan for
[MAC-40](https://linear.app/macrotouch/issue/MAC-40/migrate-to-hellosnapshot-and-commandstate-patch-protocol).

Branch `khm45/mac-40-migrate-to-hellosnapshot-and-commandstate-patch-protocol`, stacked on
MAC-38 (`c428281`), which declared every type this ticket consumes.

**Done when:** no client sends the whole state, the server no longer does `Object.assign` on
client state, and the regression checklist passes.

---

## Decisions already made

| Question | Decision |
| --- | --- |
| Where the split files live | `server/master/`, still loaded by the Nitro plugin. MAC-39 relocates the folder later as a pure `git mv`. |
| Validation depth | Per-message validation with an `error` reply (`invalid-message`), socket stays open. |
| Checklist verification | Record a baseline on `master` **first**, re-run after, diff the two. |
| Delivery | One PR. |

---

## Target layout

```
server/
  plugins/websocket.ts     thin — reads env/paths, starts the gateway
  master/
    gateway.ts             ws server, client registry, handshake, routing, broadcast
    state-store.ts         owns MacroState, applies commands, produces patches
    state-file.ts          load/save ~/.macroTouch/state.json
    validate.ts            raw JSON -> ClientToMasterMessage | ProtocolError
app/
  composables/useWebSocket.ts      sends hello, surfaces snapshot/state-patch/error
  plugins/websocketSync.client.ts  wires store <-> socket
  stores/macro.ts                  sends commands, applies patches
types/
  websocket.ts             DELETED
```

Nothing new is invented here — every message type comes from `shared/protocol`.

---

## Phase 0 — Baseline (do this before touching code)

`docs/baseline-runs/` is empty. The checklist cites
`baseline-runs/2026-10-16-master-d85c18d.md` as its reference, but that file was never committed,
so right now "the checklist passes" has nothing to pass against.

1. `git checkout master` (at `93e0004`)
2. Run the items MAC-40 can plausibly affect — **ST-01..08, SY-01..08, SC-05/06/08/09, MC-02/06/08/10/11, RT-01/03/04** — recording the observable for each.
3. Commit `docs/baseline-runs/2026-10-19-master-93e0004.md`.

Two passes are needed per the checklist's own instructions: once against an existing
`state.json`, once with `MACROTOUCH_DATA_DIR` pointed at an empty directory.

This is worth the hour. Without it, every ⚠ quirk below is an argument rather than a diff.

---

## Phase 1 — Server

### 1a. `state-file.ts`

Straight lift of the existing file I/O. Behavior that **must not change**:

- Pretty-print with 2-space indent (ST-02)
- `ENOENT` → start with `{ macros: {}, screens: {} }`, no error (ST-01)
- Invalid JSON → log, start **empty**, no backup of the corrupt file (ST-05 ⚠)
- Write failure → log only, no UI signal, app stays usable (ST-06)
- Writes stay async / non-blocking (ST-08)

### 1b. `state-store.ts`

Owns the state. Public surface:

```ts
getState(): MacroState
applyCommand(cmd: StateCommand): StatePatch | ProtocolError
```

Each command returns the patch describing exactly what changed:

| Command | Patch |
| --- | --- |
| `upsert-macro` | `{ macros: { [id]: macro } }`, plus `{ screens: { [screenId]: screen } }` when `placement` is set |
| `delete-macro` | `{ macros: { [id]: null }, screens: { [screenId]: screen } }` |
| `move-macro` | `{ screens: { [screenId]: screen } }` |
| `upsert-screen` | `{ screens: { [id]: screen } }` |
| `delete-screen` | `{ screens: { [id]: null }, macros: { [each]: null } }` — the SC-08 cascade |
| `update-settings` | `{ settings: { ...changed } }` |

Commands naming something that doesn't exist (unknown `screenId`, out-of-range `Position`) return
`ProtocolError` rather than throwing. The gateway turns that into an `error` message.

**Grid normalization moves here.** Today the client re-normalizes in `setState` — clamping
`macrosIds` to the column count and padding rows (`stores/macro.ts:65-82`). That client-side
clamp is what produces SC-06 ⚠ (shrinking a grid silently drops placements and orphans the macro
records). Under the new protocol the client applies patch entities directly, so if the clamp
stays only on the client it stops running on edits and **SC-06 changes behavior**. Put the
normalization in `applyCommand` for `upsert-screen` so the master produces already-clamped
screens and the quirk is preserved. Keep the client's snapshot-time normalization as a
belt-and-braces duplicate for now.

### 1c. `validate.ts`

```ts
parseClientMessage(raw: string): ClientToMasterMessage | ProtocolError
```

- JSON parses? → else `invalid-message`
- `type` is one of the nine client→master literals? → else `invalid-message`
- required fields present with the right primitive types? → else `invalid-message`

On rejection the gateway replies `{ type: 'error', error: { code: 'invalid-message', ... } }`
and **keeps the socket open** (SY-07 says log and stay up; the reply is additive and doesn't
change that observable).

This is the hole worth closing: today `if (data.state)` is the only check before
`Object.assign` writes client-supplied data to `state.json`.

### 1d. `gateway.ts`

Connection lifecycle:

```
client connects
  -> client sends  hello { protocolVersion, role }
  -> master checks protocolVersion === PROTOCOL_VERSION
       mismatch -> error { unsupported-protocol-version }, then close
  -> master sends  snapshot { protocolVersion, state }
  -> client is live
```

- **Do not ship empty `catalogs` / `actionState` on `snapshot`.** No producer exists until
  MAC-41 / Demo 2, and an absent field means "unavailable" while an empty one means "nothing to
  show". The ticket is explicit about this.
- Role is recorded per connection even though Demo 1 doesn't branch on it — MAC-41 needs it for
  catalogs, Demo 2 for watch tracking.
- Messages arriving **before** `hello` are rejected with `invalid-message`.
- On a command: validate → `applyCommand` → persist → broadcast `state-patch` to **every**
  client including the sender (idempotent; keeps reconnect and live clients on one code path).
- `macro-trigger` keeps today's behavior exactly: resolve the macro, run it on the host,
  reply nothing (RT-02 ⚠ is fire-and-forget; unknown id logs a warning per RT-03). The
  `requestId` field is populated but no `action-result` is sent — that producer arrives with
  MAC-41.
- `view-screen` is accepted and ignored (no watch tracker until Demo 2).

---

## Phase 2 — Client

### 2a. `useWebSocket.ts`

- Send `hello { protocolVersion: PROTOCOL_VERSION, role }` in `onopen`.
- Role comes from the route — `/screen` is `controller`, everything else `editor`.
- Replace the single `state` handler with `snapshot`, `state-patch`, and `error`.
- `send()` takes `ClientToMasterMessage`, so a malformed outbound message is now a compile error.
- **Do not add reconnect logic.** SY-05 ⚠ records that there is no retry and the page must be
  reloaded. Adding one here would be an unrelated behavior change.

### 2b. `stores/macro.ts`

The nine `maybeBroadcast()` call sites each become a specific command:

| Store function | Command |
| --- | --- |
| `updateMacro` | `upsert-macro` |
| `addMacro` | `upsert-macro` with `placement` |
| `deleteMacro` | `delete-macro` |
| `moveMacro` | `move-macro` |
| `addScreen` / `updateScreen` | `upsert-screen` |
| `deleteScreen` | `delete-screen` |
| `updateSettings` | `update-settings` |

`maybeBroadcast()` and `BroadcastData` both disappear.

**Apply locally first, then send** (optimistic), which is what the store does today — the UI
updates on save without waiting for a round trip. The returned patch re-applies the same change
idempotently.

**Echo-loop guard.** Split the internals cleanly:

- public mutators → mutate + send a command
- `applyPatch(patch)` → mutate only, never sends

`isApplyingRemoteState` stays as the guard. `isReady` should flip on **snapshot**, not on socket
open, or the first command can race the handshake.

`setState` becomes `applySnapshot`. Keep its normalization pass for now (see 1b).

### 2c. `websocketSync.client.ts`

Collapses to wiring: `snapshot → store.applySnapshot`, `state-patch → store.applyPatch`,
`error → console.warn`. The `'macros' in data` sniffing goes away — the types discriminate now.

---

## Phase 3 — Remove the old protocol

Delete `types/websocket.ts` (`WebSocketMessage`, `BroadcastData`, `WebSocketState`) and its line
in `types/index.ts`. Four files import from it today:

```
app/stores/macro.ts:5,38,40
app/plugins/websocketSync.client.ts:3,15
app/composables/useWebSocket.ts:3,6,32,66
server/plugins/websocket.ts:2,11,120,145
```

This is the moment MAC-38 stops being inert — after this, `shared/protocol` is the only
vocabulary in the repo.

---

## Phase 4 — Verify

1. `npm run typecheck:protocol` — green
2. `npx eslint app server shared types` — no new findings
3. Re-run the Phase 0 checklist items, record `docs/baseline-runs/2026-10-19-mac-40-<sha>.md`
4. Diff against the baseline. Every difference is either listed below or a bug.

Worth driving with Playwright against real Chrome (as in the MAC-38 session) for the
multi-client items — SY-01/02/03/04 need two connected clients and are tedious by hand.

---

## Expected behavior changes

Everything else must be byte-identical to the baseline. These three are intended:

**SY-06 — concurrent edits.** Recorded as ⚠ "last write wins at the top level — the whole
`macros`/`screens`/`settings` map from the last client to broadcast replaces the previous."
Granular commands make this structurally impossible; two clients editing *different* macros now
both survive. This is the point of the ticket, not a regression — but it **contradicts the
checklist as written**, so update SY-06 in `docs/regression-checklist.md` as part of this PR and
say so in the description.

**SY-07 — malformed message.** Still logged, socket still stays up, other clients still
unaffected. Now *also* gets an `error` reply. Additive; the recorded observable still holds.

**MC-06 — switching action type.** The ⚠ note says keys with the same name carry over between
actions. Unchanged by this ticket — the leak is in `ActionFields`, not the sync layer. Confirm it
still behaves the same rather than accidentally fixing it.

---

## Risks

1. **SC-06 depends on where the clamp runs.** Covered in 1b. The most likely accidental
   regression in the whole ticket.
2. **`isReady` racing the handshake.** The store currently gates on socket state; it must gate on
   `snapshot` or the first edit can be sent before the client knows the server's state and will
   be clobbered by the snapshot that follows.
3. **Settings are optional in `MacroState`.** `settings?: MacroSettings` — `update-settings` has
   to handle the undefined case on a fresh state file (ST-01).
4. **`delete-screen` cascade produces a large patch.** Every macro on the screen is a `null`
   entry. Correct, but worth an eye on a 20×20 grid.
5. **Two passes in Phase 0 and Phase 4.** First-run behavior is its own path; a baseline taken
   only against an existing `state.json` misses ST-01/ST-02 entirely.

---

## Out of scope

- `catalogs` on `snapshot`, `run-action`, `action-result`, the node registry — **MAC-41**
- `view-screen` acting on anything, `watch-actions`, `action-state` — **Demo 2**
- `quit` handling — **MAC-42**
- Moving `server/master/` out of Nitro — **MAC-39**
- `stores/macro.ts` still imports `util/actions` directly for the editor's action list. That
  coupling is removed in MAC-41, not here.
- The 5 pre-existing `vue-tsc` errors in `app/` and the stale-parameter leak in `ActionFields`.
