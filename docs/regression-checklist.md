# MacroTouch Regression Checklist

This is the behavior contract for MacroTouch as it exists today. It describes **what the app
does**, not **how it does it**, so that it survives the
[MAC-11](https://linear.app/macrotouch/issue/MAC-11/re-architect-server-structure) re-architecture
of the server into Master Server / Action Server / Electron App.

## How to use this document

- Every MAC-11 ticket cites the item IDs it touches as its acceptance criteria. A ticket is done
  when its cited items still produce the same observable result as the recorded baseline.
- Item IDs are **stable**. Never renumber. If an item stops applying, strike it and leave the ID in
  place with a note pointing at the ticket that changed it.
- Expected results are written as **observables** — something visible in the UI, in `state.json`, in
  the server console, or as an effect on the operating system. Deliberately nothing here names a
  file, class, or module, because the refactor moves all of them.
- ⚠ marks **current behavior that looks like a bug**. It is recorded as-is on purpose. Do not "fix"
  it as part of a refactor ticket — that makes it impossible to tell *preserved* from *accidentally
  changed*. File a separate ticket if it should change.
- Results go in `docs/baseline-runs/`, not in this file, so that re-runs don't churn the contract.
  The reference baseline is
  [`2026-10-16-master-d85c18d.md`](baseline-runs/2026-10-16-master-d85c18d.md).

## Environment under test

| Thing | Value | Notes |
| --- | --- | --- |
| Nuxt app | port `4321` | Electron waits on `127.0.0.1:4321`; dev server binds `0.0.0.0` |
| WebSocket server | port `4322` | overridable via `WS_PORT` / `NUXT_WS_PORT` |
| State file | `~/.macroTouch/state.json` | overridable via `MACROTOUCH_DATA_DIR`, else `XDG_DATA_HOME` |
| Launch modes | `npm run dev` (browser only), `npm run dev:electron`, `npm run electron:preview`, packaged `npm run dist` | Several items behave differently with and without the Electron shell — each says which |

A full baseline needs **two passes**: once against an existing `state.json`, and once with
`MACROTOUCH_DATA_DIR` pointed at an empty directory, because first-run behavior is its own path.

---

## A. Startup and persistence (`ST`)

**ST-01 — Cold start with no state file.** Point `MACROTOUCH_DATA_DIR` at an empty directory and
start the app. The data directory is created, the editor opens, and a screen named `Screen` exists
with the default grid from Settings. No error dialog.

**ST-02 — State file is created on first change.** From ST-01, make any edit. `state.json` appears
in the data directory, pretty-printed with 2-space indent, containing `macros`, `screens` and
`settings`.

**ST-03 — State survives an app restart.** Create a screen and at least one macro, quit the app
fully, start it again. Screens, macro placement, macro names/icons/colors, action parameters and
settings are all exactly as they were.

**ST-04 — State is loaded before the first paint of content.** On restart, the editor does not
briefly show an empty state and then auto-create a second `Screen`. Screen count after restart
equals screen count before.

**ST-05 — Corrupt state file.** Replace `state.json` with invalid JSON and start the app. ⚠ The
read fails, the error is logged to the server console, and the app starts with **empty** state —
the corrupt file is not backed up, and the first subsequent edit overwrites it.

**ST-06 — Unwritable data directory.** Make the data directory read-only and start the app. The app
still starts and is usable; the save failure is logged to the console only, with no UI indication.

**ST-07 — Port already in use.** Start a second instance while the first is running (or occupy
`4322` with another process). The websocket server logs that the port is in use and skips startup
rather than crashing the app. ⚠ It then logs `WebSocket server started on port 4322` anyway — the
success line is printed unconditionally, so the log claims a server that isn't listening.

**ST-08 — Save is non-blocking.** Rapidly make ~20 edits in a row. The UI stays responsive and the
final `state.json` matches the final in-app state.

---

## B. State sync between clients (`SY`)

**SY-01 — State on connect.** Open a second client (another browser tab, or a phone). It receives
the current full state immediately on connecting, without the first client doing anything.

**SY-02 — Edit propagates to all clients.** Edit a macro name in the editor. Every other connected
client shows the new name without a reload.

**SY-03 — Deletions propagate.** Delete a macro and then a screen. Both disappear on every other
connected client.

**SY-04 — Settings propagate.** Change a default in Settings and save. Other connected clients
receive the new settings.

**SY-05 — Reconnect after server restart.** ⚠ With a client open, restart the app's server. The
client does **not** reconnect automatically — there is no retry. The page must be reloaded. Any
triggers attempted in the meantime are silently dropped.

**SY-06 — Concurrent edits.** Edit from two clients at once. ⚠ Last write wins at the top level —
the whole `macros`/`screens`/`settings` map from the last client to broadcast replaces the
previous. No merge, no conflict warning.

**SY-07 — Malformed message is ignored.** Send a non-JSON or type-less websocket message. The
server logs a warning and stays up; other clients are unaffected.

**SY-08 — A client never executes actions.** Confirm that a `macro-trigger` broadcast does not
cause the desktop editor's browser context to attempt the action. Only the host process executes.

---

## C. Screens (`SC`)

**SC-01 — Create a screen.** `Add Screen` on the home page opens a modal titled **Create Screen**.
Saving adds the screen, selects it in the dropdown, and renders its grid.

**SC-02 — New screen defaults.** A newly created screen uses the default grid size and background
color from Settings, with black default macro icon color and white default macro background.

**SC-03 — Edit a screen.** `Edit Current Screen` opens a modal titled **Edit Screen** pre-filled
with the current name, rows, columns, background color and the two default macro colors. Saving
applies all of them.

**SC-04 — Grid size clamping.** Enter rows/columns of `0` and of `99`. Both are clamped into the
range 1–20 on save.

**SC-05 — Growing a grid preserves macros.** Increase rows and columns on a screen that has macros.
Existing macros stay in their original row/column; new cells are empty.

**SC-06 — Shrinking a grid.** Place a macro in the last column, then reduce the column count below
it. ⚠ The macro's placement is dropped from the row when state is next round-tripped through the
server, and the macro record itself is left behind in `macros` with no screen referencing it. It is
not recoverable by growing the grid back.

**SC-07 — Delete a screen.** Deleting prompts with a native `confirm()` naming the screen. Cancel
leaves everything untouched.

**SC-08 — Delete cascades to its macros.** Confirming the delete also deletes every macro placed on
that screen; they do not survive as orphans. Macros on other screens are unaffected.

**SC-09 — Selection after delete.** After deleting the selected screen, the first remaining screen
is selected. Deleting the last screen leaves the empty state (`No screens yet. Create one to
begin.`).

⚠ Note for SC-09: with zero screens, a reload of the home page auto-creates a `Screen` again
(see ST-01), so "no screens" is not a state that survives a refresh.

**SC-10 — Screen dropdown.** The dropdown lists every screen by name, in insertion order, and
switching selection swaps the rendered grid.

---

## D. Macros (`MC`)

**MC-01 — Create a macro.** Tap an empty cell in the editor. A modal titled **Create Macro** opens,
pre-filled with name `New Macro`, the home icon, and the screen's default icon/background colors.
The first action in the list is pre-selected.

**MC-02 — Macro lands in the tapped cell.** After saving, the macro renders in the cell that was
tapped, not elsewhere.

**MC-03 — Edit a macro.** Tapping a filled cell in the editor opens **Edit Macro** with that
macro's current name, icon, colors, action and parameter values.

**MC-04 — Icon picker.** The icon picker opens, is searchable, and selecting an icon updates the
preview in the modal and the cell after save.

**MC-05 — Colors.** Changing icon color and background color updates the live preview and persists
to the cell.

**MC-06 — Switching action type resets parameters.** Change the selected action in the modal. The
parameter fields are replaced with the new action's fields; values for keys that don't exist on the
new action are dropped. ⚠ Keys with the same name carry over between actions.

**MC-07 — Parameter field types render correctly.** String, enum (dropdown), executable path, file
path and key-combo capture each render their own input per the selected action.

**MC-08 — Delete a macro.** Deleting prompts with a `confirm()` naming the macro. Cancelling keeps
it. Confirming empties the cell and removes the macro from state.

**MC-09 — Macro with no action.** A macro can be saved without a usable action. Triggering it logs
a warning on the host and does nothing. No crash, no UI error.

**MC-10 — Move a macro.** Move a macro from one cell to another on the same screen. The source cell
becomes empty, the target cell holds it, and the change persists across a restart.

**MC-11 — Move onto an occupied cell.** ⚠ Moving a macro onto a cell that already holds one
overwrites the target's placement; the overwritten macro remains in `macros` with nothing pointing
at it.

---

## E. Pairing and device access (`PA`)

**PA-01 — Connect page lists interfaces.** `/connect` lists every non-internal IPv4 interface, with
Ethernet first, then Wi-Fi, then others. The first is badged **Primary**.
⚠ The sort matches interface names against Linux/Windows naming (`eth`, `enp`, `wlan`, `wlp`, …).
macOS names its interfaces `en0`/`en1`, which match neither list, so on macOS every interface sorts
as "other" and the ordering is just enumeration order. The **Primary** badge is therefore not
meaningful on macOS.

**PA-02 — No network.** With all LAN interfaces down, the page shows `No private LAN IPv4 addresses
found.` rather than an error or an empty list.

**PA-03 — API failure.** If the interface lookup fails, the page shows `Could not detect local
network interfaces.`

**PA-04 — URL shape.** Each listed URL is `http://<interface ip>:<port of the current page>/`.

**PA-05 — QR code for the selected interface.** The selected card renders a QR code; others don't.
Clicking a different card moves the QR to it.

**PA-06 — Pair by typing the URL.** Type the listed URL into a phone browser on the same LAN. The
phone lands on the runtime screen showing the current layout.

**PA-07 — Pair by scanning the QR.** Scan the QR code with the phone camera. Same result as PA-06.

**PA-08 — Remote clients are forced to the runtime.** From the phone, request `/`, `/home`,
`/settings` and `/connect`. All redirect (302) to `/screen`. The editor and settings are not
reachable from a remote device.

**PA-09 — Local requests reach the editor.** On the host, `/` redirects to `/home` and `/settings`
and `/connect` load normally.

**PA-10 — Phone reflects live edits.** With the phone connected, add a macro on the host. It appears
on the phone without a reload.

---

## F. Runtime screen (`RT`)

**RT-01 — Trigger a macro from the phone.** Tap a macro on the phone. The action runs on the host
computer.

**RT-02 — Trigger is fire-and-forget.** ⚠ The phone shows no success, failure or pending state after
a tap, whatever the action does. The only evidence is the OS-level effect plus the host console.
Any item below that says "the action runs" is verified on the host, not on the phone.

**RT-03 — Trigger an unknown macro.** Trigger a macro that was deleted on another client moments
earlier. The host logs an unknown-macro warning; nothing executes and nothing crashes.

**RT-04 — Empty cells are inert.** Tapping an empty cell on the runtime screen does nothing.

**RT-05 — Runtime is not editable.** Tapping a macro on the runtime screen triggers it and never
opens the edit modal.

**RT-06 — Swipe changes screens.** With more than one screen and `Swipe to change screens` on, a
horizontal swipe moves to the next/previous screen and wraps around at both ends. A toast names the
screen for ~1s.

**RT-07 — Swipe thresholds.** A swipe is only recognized when it travels more than 60px
horizontally, completes within 600ms, and is at least 1.5× more horizontal than vertical. Slower or
shorter drags do nothing.

**RT-08 — Swipe does not trigger a macro.** A swipe that starts on a macro changes the screen
without firing that macro.

**RT-09 — Swipe disabled.** With `Swipe to change screens` off, swiping does nothing and macros
still trigger normally.

**RT-10 — Fullscreen attempt.** With `Attempt to Fullscreen` on, the runtime tries to enter
fullscreen on load. If the browser refuses without a gesture, a `Tap anywhere to enter fullscreen`
hint and toast appear, and the next tap enters fullscreen and clears the hint.

**RT-11 — Fullscreen disabled.** With the setting off, no fullscreen attempt and no hint.

**RT-12 — Runtime with zero screens.** ⚠ Opening the runtime when no screens exist renders a blank
surface with no message (unlike the editor's empty state).

---

## G. Actions (`AC`)

Actions execute on the **host** process. Several branch per platform; record each cell of the grid
separately and mark untested platforms as **not verified** rather than leaving them blank.

| ID | Action | macOS | Windows | Linux |
| --- | --- | --- | --- | --- |
| AC-01 | Shell Command | `$SHELL` via `exec` | `%COMSPEC%` via `exec` | `$SHELL` via `exec` |
| AC-02 | Launch App — URL | `open` | `start ""` | `xdg-open` |
| AC-03 | Launch App — application | `open -a "<path>.app"` | `start "" "<path>"` | spawn binary directly |
| AC-04 | Send Notification | `terminal-notifier` | SnoreToast | `notify-send` |
| AC-05 | Key Combo | `osascript` System Events | PowerShell `SendKeys` | `xdotool`, falling back to `ydotool` |
| AC-06 | Type Text | `osascript` keystroke | PowerShell `SendKeys` | `xdotool type`, falling back to `ydotool type` |
| AC-07 | Multimedia Control | `osascript` (Music/Spotify, else media keys) | PowerShell `SendKeys` / `nircmd` | `playerctl`; volume via `wpctl` → `pactl` → `amixer` |

**AC-01 — Shell Command.** A command with an observable side effect (e.g. writing a file) runs and
produces that effect. An empty or missing command logs a warning and does nothing.
⚠ The command string is passed to the shell unquoted and unescaped — shell metacharacters in the
field are interpreted. That is current behavior and the field is trusted input.

**AC-02 — Launch App, URL branch.** An `http(s)://` target opens in the default browser via the
platform opener, with or without the Electron shell. A custom scheme (e.g. `mailto:`) is also treated as a URL — anything matching
`scheme:` counts.

**AC-03 — Launch App, application branch.** On macOS a `.app` bundle path launches that app; a
non-`.app` path is run as a raw binary. On Windows a path launches via `start`. Arguments in the
`Arguments` field are appended. An empty `App` field logs a warning and does nothing.

**AC-04 — Send Notification.** An OS notification appears with the given title and message,
defaulting the title to `MacroTouch` when blank, with or without the Electron shell (including
plain `npm run dev`). If the OS refuses it, the failure is logged as an error.

**AC-05 — Key Combo.** Capture a combo (e.g. `cmd+c` / `ctrl+c`), trigger it, and confirm the
receiving app saw the keystroke. Modifier aliases (`ctrl`/`control`, `cmd`/`command`/`meta`/`win`,
`alt`/`option`) all resolve. Named keys (`enter`, `tab`, `space`, `backspace`, `delete`, `escape`,
arrows) work as well as plain characters.
⚠ On macOS this requires Accessibility permission for the host app; without it the combo silently
does nothing.

**AC-06 — Type Text.** Focus a text field and trigger. The exact text is typed, including
characters that are special to the underlying mechanism (`{`, `}`, `^`, `%`, `~`, `+`, quotes).
Same Accessibility caveat as AC-05.

**AC-07 — Multimedia Control.** Each of `PlayPause`, `NextTrack`, `PreviousTrack`, `VolumeUp`,
`VolumeDown`, `Mute` has its effect. Volume steps by 5% per trigger.
⚠ macOS `Mute` only mutes — repeating it does not unmute, unlike every other platform where mute
toggles.
⚠ macOS prefers Music, then Spotify, and only sends media keys if neither is running, so the
behavior depends on what is open.

**AC-08 — Unknown action id.** A macro referencing an action id that no longer exists logs a
warning on trigger and does nothing.

**AC-09 — Failing action does not take down the host.** Trigger a Shell Command that exits non-zero
and a Launch App pointing at a nonexistent path. Both log an error and the app keeps serving, with
subsequent triggers still working.

---

## H. Settings page (`SE`)

**SE-01 — Page reflects stored settings.** Opening Settings shows the stored background color, grid
size, and the two working toggles.

**SE-02 — Save persists and navigates.** `Save` writes the settings, broadcasts them, and navigates
to `/home`.

**SE-03 — Cancel.** ⚠ `Cancel` resets the form fields to the stored values but **stays on the
Settings page** — it does not navigate away.

**SE-04 — Unsaved changes are discarded on navigation.** Changing a field and navigating away
without saving leaves the stored settings unchanged.

**SE-05 — Grid size clamping.** Rows/columns are clamped into 1–20 on save, matching SC-04.

**SE-06 — Default background color applies to new screens only.** Changing it does not recolor
existing screens.

**SE-07 — Default grid size applies to new screens only.** Same as SE-06.

**SE-08 — `Swipe to change screens` is live.** Toggling it and saving changes runtime behavior on
already-connected devices (see RT-06/RT-09).

**SE-09 — `Attempt to Fullscreen` is live.** Toggling it and saving changes runtime behavior on the
next runtime page load.

**SE-10 — Inert toggles.** ⚠ `Start on boot`, `Minimize on close`, `Button haptics` and `Hide blank
buttons` are rendered but **not wired to anything**. They do not persist, do not survive a page
reload, and have no effect. This is current behavior, not a regression — do not implement them
inside a MAC-11 ticket.

**SE-11 — Settings round-trip.** Save settings, restart the app, reopen Settings. The two working
toggles, color and grid size are as saved.

---

## I. Electron shell (`EL`)

**EL-01 — App launches.** `npm run dev:electron` (dev) and `npm run electron:preview` (production
build) both open a window on the editor, after the Nuxt server is up.

**EL-02 — Single instance.** Launching a second copy focuses and restores the existing window
rather than opening a new one.

**EL-03 — Server shutdown on quit.** Quitting the app leaves no orphaned Nuxt or websocket process,
and ports `4321`/`4322` are free afterwards.

**EL-04 — External links.** A Launch App URL action opens in the system browser, not inside the
Electron window.

~~**EL-05 — Notification server.** While the shell is running, the notification endpoint on `4323` is
listening and AC-04 produces a real OS notification.~~ Removed by MAC-11: notifications no longer
go through Electron; AC-04 covers them.

**EL-06 — Packaged build.** `npm run dist` produces an artifact in `dist-electron/` that launches
and passes ST-03, PA-06 and one action end to end.

---

## Appendix: quirk index

Current behavior that is surprising, recorded so the refactor preserves it knowingly. Each needs a
deliberate decision — preserve, or a separate ticket — before the matching MAC-11 ticket closes.

| Item | Quirk |
| --- | --- |
| ST-05 | Corrupt state file silently becomes empty state and is overwritten on the next edit |
| ST-06 | Save failures are console-only; the UI reports success |
| ST-07 | The "WebSocket server started" log line prints even when the port was already taken |
| PA-01 | Interface priority sort doesn't recognise macOS `en0`-style names; Primary badge is arbitrary there |
| SY-05 | No websocket reconnect; clients go stale until reloaded |
| SY-06 | Concurrent edits are last-write-wins with no merge or warning |
| SC-06 | Shrinking a grid drops placements and orphans the macro records |
| SC-09 | "No screens" does not survive a reload — one is auto-created |
| MC-06 | Same-named parameter keys carry across a change of action type |
| MC-11 | Moving onto an occupied cell orphans the overwritten macro |
| RT-02 | Triggers are fire-and-forget; the phone never learns an action failed |
| RT-12 | Runtime with zero screens renders blank with no message |
| AC-01 | Shell Command is passed to the shell unescaped |
| AC-05/06 | macOS needs Accessibility permission; without it, input actions fail silently |
| AC-07 | macOS `Mute` does not toggle; behavior depends on Music/Spotify being open |
| SE-03 | `Cancel` does not leave the Settings page |
| SE-10 | Four Settings toggles are decorative and do nothing |
