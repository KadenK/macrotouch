# Plugins

A plugin adds actions to MacroTouch, and optionally new faces for the macros that use them. Everything in the action picker comes from a plugin: the built-in Keyboard, Media and System sets are plugins in `plugins/core-*`, loaded the same way as yours.

- [Using plugins](#using-plugins)
- [Writing a plugin](#writing-a-plugin)
- [Actions](#actions)
- [Checks: when an action can run](#checks-when-an-action-can-run)
- [Settings and secrets](#settings-and-secrets)
- [Live state](#live-state)
- [Faces](#faces)
- [Reference](#reference)

## Using plugins

Everything is in **Settings → Plugins**, on the computer running MacroTouch (the master). Other devices can't install or change plugins.

- **Install:** "Install from folder" (a plugin's folder) or "Install from file" (a `.mtplugin.json`). The plugin is copied to every action server.
- **Update:** install the new version the same way. You're asked to confirm the version change; settings and secrets are kept.
- **Enable / disable:** the toggle on its row. A disabled plugin stops running on every action server, but keeps its settings and secrets.
- **Remove:** deletes the plugin, its settings, and its secrets and data on every action server. Macros that used it stay, with a red badge in the editor saying why they can't run; reinstalling the plugin brings them back.
- **Configure:** the plugin's settings, its secrets, and **Test connection** if the plugin has one. Settings save as you change them; a secret saves with its Save button or Enter.
- **Status:** the badge next to each plugin's name is the worst status across your action servers: Ready, Not ready, Needs setup, Missing dependency, Not supported, Error, or Disabled. Any problem is spelled out under it.

> Plugins run with full access to every computer they're installed on. Only install plugins you trust.

## Writing a plugin

A plugin is a folder:

```
my-plugin/
  package.json   # the manifest
  server.mjs     # the actions; runs on every action server (Node, ES module)
  ui.mjs         # optional: faces, runs in the browser (ES module)
```

Pack it into one file to share with `node scripts/pack-plugin.mjs my-plugin [output]` (default `<id>-<version>.mtplugin.json`), or install the folder directly. Files and folders starting with `.`, and `node_modules`, are left out, so **bundle any dependencies** into `server.mjs` / `ui.mjs` (e.g. with esbuild). A package can have at most 500 files and 20 MiB.

### A minimal plugin

`package.json`:

```json
{
  "name": "macrotouch-plugin-hello",
  "version": "1.0.0",
  "macrotouch": {
    "id": "hello",
    "label": "Hello",
    "icon": "ic:baseline-waving-hand",
    "apiVersion": 1
  }
}
```

`server.mjs`:

```js
export default {
  actions: [
    {
      id: 'greet',
      label: 'Say hello',
      icon: 'ic:baseline-chat',
      actionFields: [{ key: 'name', label: 'Name', type: 'string' }],
      execute: (parameters, ctx) => ctx.log.log(`Hello, ${parameters?.name || 'world'}!`),
    },
  ],
}
```

Install the folder, and "Say hello" appears in the action picker under **Hello**. Its full id is `hello/greet`.

The type definitions are in `plugin-sdk/index.ts`; `definePlugin()` and `defineAction()` there only add types, so a plain object works too.

### The manifest

The `macrotouch` key of `package.json`. `name` and `version` are required at the top level; `version` is what Settings shows.

| Field | |
|---|---|
| `id` | Required. Lowercase letters, digits and `-`. Prefixes every action id (`<id>/<action>`). Can't start with `core-`. Changing it makes it a different plugin. |
| `label` | Required. Shown in the action picker and Settings. |
| `apiVersion` | Required. `1`. |
| `icon` | An [Iconify](https://icon-sets.iconify.design/) name, e.g. `ic:baseline-home`. |
| `server` | The actions file. Default `server.mjs`. |
| `ui` | The faces file, if any. |
| `platforms` | `["linux", "darwin", "win32"]`, or a subset. Omitted: all. |
| `settings` | See [Settings and secrets](#settings-and-secrets). |
| `checks`, `requires`, `ready` | See [Checks](#checks-when-an-action-can-run). |
| `actions` | Per-action `requires`, `ready` and `platforms`, keyed by action id, so they're checked without loading your code. |
| `faces` | See [Faces](#faces). |

### The module

`server.mjs` default-exports:

| Field | |
|---|---|
| `actions` | Required. The actions, see below. |
| `activate(ctx)` | Optional. Called once the plugin passes its checks; open connections here. Return `{ dispose() }` to clean up. |
| `onSettingsChanged(ctx)` | Optional. Called after a setting or secret changes (`ctx` is already updated). Without it, the plugin is disposed and activated again. |
| `test(ctx)` | Optional. Adds **Test connection**, see [Connection test](#connection-test). |
| `check(ctx)` / `isReady(ctx)` | Optional. Plugin-wide checks in code, see [Checks](#checks-when-an-action-can-run). |

Every function gets `ctx`:

| `ctx.` | |
|---|---|
| `pluginId`, `platform` | Your id, and `linux`, `darwin` or `win32`. |
| `settings` | Non-secret settings. Updated in place when they change. |
| `secrets` | This action server's secrets. Updated in place. |
| `dataDir` | A folder you may keep files in (created before `activate`). Deleted when the plugin is removed. |
| `log.log/warn/error` | Logs to the action server's output, prefixed with your id. Secret values are blanked out. |
| `exec(command)` | Runs a command line in the default shell. Resolves with its output; rejects on a non-zero exit, with `stdout`/`stderr` on the error. |
| `spawn(program, args)` | Runs a program without a shell, so arguments are passed as-is. Resolves with its output. |

Commands started with `ctx.exec`/`ctx.spawn` during a run are killed if the run is cancelled or times out. Prefer `ctx` over your own `child_process` calls for that reason.

## Actions

```js
{
  id: 'setVolume',                     // full id: <plugin id>/setVolume
  label: 'Set volume',
  group: 'Audio',                      // optional sub-heading in the action picker
  description: 'Set the output volume', // optional, shown under the label
  icon: 'ic:baseline-volume-up',       // optional; a new macro starts with this icon
  actionFields: [
    { key: 'level', label: 'Level (%)', type: 'string' },
  ],
  execute: async (parameters, ctx) => { /* ... */ },
}
```

- **`actionFields`** are what the user fills in for each macro. `type` is one of `string`, `enum` (with `options: [...]`), `filepath`, `executablePath` or `keyCombo`. The values arrive as `parameters` (`parameters.level`).
- **`execute(parameters, ctx)`** runs the action. Whatever it returns is sent back to the device as the result; a thrown error is shown to the user, so make its message readable. A run that takes over 30 seconds is stopped.
- **Per-OS code:** instead of `execute`, give `impl: { linux: fn, darwin: fn, win32: fn }`. An OS with no entry shows the action as "Not supported" there.
- **`platforms`**: limit one action to some OSes, like the plugin-level field.
- **`face`**: which face draws its macros, see [Faces](#faces).
- **`states`**: what the action reports live, see [Live state](#live-state).

### Options supplied at run time

For a field whose choices come from somewhere else (devices, channels, entities), mark it `dynamicOptions: true` and supply them:

```js
{
  id: 'toggleLight',
  label: 'Toggle light',
  actionFields: [{ key: 'light', label: 'Light', type: 'enum', dynamicOptions: true }],
  options: {
    light: async (parameters, ctx) => [
      { value: 'desk', label: 'Desk lamp' },
      { value: 'porch', label: 'Porch light' },
    ],
  },
  execute: async (parameters) => { /* parameters.light */ },
}
```

The editor asks when the macro editor opens (on the action server the macro runs on) and has a Refresh button. Answer within 10 seconds. `options` on the field, if given, is used when the action server can't be reached.

## Checks: when an action can run

Each action is checked on each action server, in this order. The first that fails sets its status:

| Check | Fails as | In the editor |
|---|---|---|
| OS (`platforms`, or `impl` without this OS) | Not supported | Greyed out |
| `requires`: can this computer ever run it? (a program is installed) | Missing dependency | Greyed out |
| `ready`: can it run right now? (an app is running, a server answers) | Not ready / Needs setup | Selectable, with a warning |

Plugin-level `requires`/`ready` apply to every action; the manifest's `actions` map adds per-action ones. `ready` is checked before each run and every 30 seconds while the plugin is active; `requires` when the plugin loads, and again after a run fails because a program is missing.

Declare checks in the manifest, so they're evaluated without loading your code (a broken plugin still says "Steam is not installed"):

```json
"macrotouch": {
  "checks": {
    "steam-installed": {
      "anyOf": [
        { "type": "command", "name": "steam" },
        { "type": "dir", "path": { "linux": "${home}/.steam/steam", "darwin": "/Applications/Steam.app" } }
      ],
      "message": "Steam is not installed",
      "hint": "Install Steam from store.steampowered.com"
    },
    "steam-running": { "type": "process", "name": { "win32": "steam.exe", "default": "steam" },
                       "message": "Steam is not running" }
  },
  "requires": ["steam-installed"],
  "actions": {
    "toggleOverlay": { "ready": ["steam-running"] }
  }
}
```

`requires`/`ready` list check names from `checks`, or inline checks. Check types:

| `type` | Passes when |
|---|---|
| `command` (`name`) | The program is on the PATH. With `args`, it's run and must exit with `exitCode` (default 0); `outputMatches` is a regex its output must match. |
| `file` / `dir` (`path`) | The path exists. |
| `process` (`name`) | A process with that name is running. |
| `env` (`name`) | The environment variable is set. |
| `registry` (`key`, `value`) | The Windows registry key (or value) exists. Passes on other OSes. |
| `http` (`url`, `status`, `timeoutMs`) | The URL answers (with that status). |
| `setting` (`key`) | The setting or secret has a value. Fails as **Needs setup**. |

Combine with `anyOf`, `allOf` and `not`. Every check takes `message` and `hint`, shown when it fails.

- **Per-OS values:** any `name` or `path` can be `{ "linux": ..., "darwin": ..., "win32": ..., "default": ... }`. A check with no entry for the current OS passes. A list of names or paths passes if any one does.
- **Variables:** `${home}`, `${env:NAME}`, `${platform}`, `${arch}`, `${dataDir}`, `${setting:KEY}`.
- **In code:** when a template can't express it, add `check(ctx)` (like `requires`) or `isReady(ctx)` (like `ready`) to the module or an action. Return `{ status: 'available' }`, or `{ status: 'not-ready', message, hint }`; `plugin-sdk` has `ok()`, `notReady()` and `missing()` helpers.

## Settings and secrets

```json
"settings": [
  { "key": "url", "label": "Server URL", "type": "string" },
  { "key": "units", "label": "Units", "type": "enum", "options": ["metric", "imperial"] },
  { "key": "token", "label": "Access token", "type": "string", "secret": true }
],
"ready": [{ "type": "setting", "key": "url" }, { "type": "setting", "key": "token" }]
```

- `type` is `string`, `number`, `boolean` or `enum`. They appear in Settings → Plugins → Configure.
- **Settings** are the same on every action server, and arrive as `ctx.settings`. They're stored in MacroTouch's state, which every paired device can see, so never put anything sensitive in one.
- **Secrets** (`"secret": true`) are stored only on each action server, in a file only its user can read, and arrive as `ctx.secrets`. The editor never sees a saved value back, only its length and, for 12 characters or more, its last 3. They're blanked out of your logs and error messages.
- To make a setting mandatory, add a `setting` check as above; the plugin then shows **Needs setup** until it's filled in. (`"required": true` on the field is only a hint.)

### Connection test

A plugin that talks to another service can export `test(ctx)`, which adds a **Test connection** button to its Configure section:

```js
async test(ctx) {
  if (!ctx.settings.url) return { ok: false, message: 'Set the server URL' }
  try {
    const response = await fetch(`${ctx.settings.url}/api`, {
      headers: { Authorization: `Bearer ${ctx.secrets.token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (response.status === 401) return { ok: false, message: 'The server rejected the access token' }
    return response.ok
      ? { ok: true, message: 'Connected' }
      : { ok: false, message: `The server answered with an error (${response.status})` }
  } catch (error) {
    return { ok: false, message: `Cannot reach ${ctx.settings.url} (${error.cause?.code ?? error.message})` }
  }
}
```

It runs on every action server and shows each answer, so say what's wrong in words. Don't use cached results. Readiness is rechecked straight after, so the status badge agrees. A test that throws or takes over 15 seconds shows as failed.

## Live state

An action can report a live value, so its macro shows what's happening (muted or not, the current brightness, a counter):

```js
{
  id: 'toggleMute',
  label: 'Toggle mute',
  actionFields: [],
  execute: (parameters, ctx) => ctx.exec('pactl set-sink-mute @DEFAULT_SINK@ toggle'),
  states: [
    {
      kind: 'toggle',
      valueLabels: { true: 'Muted', false: 'Unmuted' },
      defaultIcons: { true: 'ic:baseline-volume-off', false: 'ic:baseline-volume-up' },
      get: async (parameters, ctx) => (await ctx.exec('pactl get-sink-mute @DEFAULT_SINK@')).includes('yes'),
    },
  ],
}
```

- **`kind`**: `toggle` (a boolean), `range` (a number from 0 to 1) or `text` (a string). It picks the macro's standard face.
- **`get(parameters, ctx)`** is polled about once a second, and straight after the action runs, while a screen showing the macro is open. Return `null` when it can't be read.
- **`subscribe(parameters, emit, ctx)`** pushes instead: call `emit(value)` on every change and return a function that stops. Give `get` too, for the first value. `emit(value, appearance)` can also override the macro's look (`{ icon, iconColor, backgroundColor, label }`).
- **`when`**: one action can report differently per parameter, e.g. `{ kind: 'toggle', when: { control: 'Mute' } }`. The first matching entry applies; none matching means no live state.
- **`valueLabels` / `defaultIcons`** name each value and give a new macro its icons for each (toggle).

## Faces

A **face** is how a macro looks in its cell. The action decides it; the user then sets the face's **face settings** (icon, colors, …) in the macro editor.

Without a `face`, an action gets the standard one for its live state:

| Face | For | Face settings |
|---|---|---|
| Icon (`icon`) | No live state, `toggle`, `range` | Icon and colors; for a toggle, colors and an icon per state |
| Value (`value`) | `text` | Colors, and text size and what goes before/after the value |

An action can name a standard face (`face: 'icon'`) or one of its plugin's own (`face: 'gauge'`).

### Plugin faces

Declare faces in the manifest, and define them as [custom elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) in `ui.mjs`:

```json
"macrotouch": {
  "ui": "ui.mjs",
  "faces": [
    { "id": "counter", "label": "Counter", "element": "hello-counter",
      "settings": ["colors", { "id": "digits", "label": "Digits", "element": "hello-digits" }] }
  ]
}
```

```js
// server.mjs: the action names the face
{ id: 'count', label: 'Count', face: 'counter', states: [{ kind: 'text', get: () => String(count) }], ... }
```

**The face element** gets these properties, set again whenever they change:

| Property | |
|---|---|
| `macro` | The macro: `name`, `icon`, `iconColor`, `backgroundColor` (`{ r, g, b, a }`), `stateAppearance`, and `faceSettings` (your face settings' values, by id). |
| `entry` | The latest live reading, `{ value, appearance }`, on a device. Absent in the editor. |
| `mode` | `'interact'` on a device, `'edit'` in the editor (don't run anything when tapped there). |
| `showLabel` | Whether to draw the macro's name. |

To run the action, dispatch `trigger`: `this.dispatchEvent(new CustomEvent('trigger', { detail: value }))`. `detail` is optional and reaches `execute` as `parameters.value` (e.g. a dial's 0–1 position).

The element is sized to fill the cell (`display: block`, full width and height). Do your layout inside its shadow root rather than on `:host`, which the app's own styles override.

```js
class HelloCounter extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>
      .face { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 8px;
              container-type: size; font: 700 50cqmin/1 var(--font-sans); cursor: pointer }
      </style><div class="face"></div>`
    this.addEventListener('click', () => this._mode === 'interact' && this.dispatchEvent(new CustomEvent('trigger')))
  }
  set mode(mode) { this._mode = mode }
  set showLabel(_) {}
  set macro(macro) { this._macro = macro; this.render() }
  set entry(entry) { this._entry = entry; this.render() }
  render() {
    const face = this.shadowRoot.querySelector('.face')
    const digits = Number(this._macro?.faceSettings?.digits) || 1
    face.textContent = String(this._entry?.value ?? 0).padStart(digits, '0')
    const rgb = (c) => (c ? `rgb(${c.r} ${c.g} ${c.b})` : '')
    face.style.color = rgb(this._macro?.iconColor)
    face.style.background = rgb(this._macro?.backgroundColor)
  }
}
customElements.define('hello-counter', HelloCounter)
```

### Face settings

A face's `settings` lists what the macro editor shows for it, in order (default `["colors"]`):

- **Standard ones:** `icon`, `colors`, `stateIcons` (a look per toggle value) and `text`. Their values reach your face through `macro` (`icon`, `iconColor`, `backgroundColor`, `stateAppearance`, `faceSettings.text`).
- **Your own:** `{ "id", "label", "element" }`, a custom element in `ui.mjs`. It gets `macro`, `state` (the action's live-state info) and `value` (what it saved before), and dispatches `change` with the new value, saved as `macro.faceSettings[id]`.

```js
class HelloDigits extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).innerHTML = '<input type="number" min="1" max="8">'
    this.shadowRoot.querySelector('input').addEventListener('input', (e) =>
      this.dispatchEvent(new CustomEvent('change', { detail: Number(e.target.value) || 1 })),
    )
  }
  set value(value) { this.shadowRoot.querySelector('input').value = String(value ?? 1) }
  set macro(_) {}
  set state(_) {}
}
customElements.define('hello-digits', HelloDigits)
```

### Matching the app

- The app's theme is CSS variables, which reach inside a shadow root: `var(--color-surface)`, `var(--color-text-strong)`, `var(--font-sans)`, `var(--radius-md)` and the rest of `app/assets/css/theme.css`. Using them follows light and dark mode.
- `<mt-icon name="ic:baseline-home">` draws an icon from the app's icon sets.
- `<mt-macro-face>` draws the standard icon face (set its `macro` and `showLabel` properties), for a face that's "the normal button, plus something".
- If a face's plugin isn't loaded yet, or was removed, the macro is drawn with the standard face for its live state until it is.

## Reference

### Where things are stored

In MacroTouch's data folder (`~/.macroTouch` by default):

| Path | |
|---|---|
| `plugin-store/<id>.json` | The installed package, on the master. |
| `state.json` → `plugins` | Installed plugins, whether enabled, and their non-secret settings. |
| `plugin-cache/<id>/<sha256>/` | The unpacked plugin, on each action server. |
| `plugin-secrets/<id>.json` | Secrets, on each action server (readable only by its user). |
| `plugin-data/<id>/` | `ctx.dataDir`, on each action server. |

Removing a plugin deletes all of these. An action server that was offline at the time cleans up when it next connects.

### Built-in plugins

`plugins/core-keyboard`, `plugins/core-media` and `plugins/core-system` use the same API (in TypeScript, bundled with the app) and are good examples, including per-OS `impl`, `command` checks and live state. Their ids start with `core-`, which installed plugins can't use.

### Protocol messages

For working on MacroTouch itself; a plugin never sends these.

| Message | From → to | |
|---|---|---|
| `install-plugin` | Editor on the master's computer → master | The package's files. Answered with `action-result`. |
| `update-plugin` / `delete-plugin` | Editor on the master's computer → master | Enable/disable, settings; remove. |
| `plugin-sync` | Master → action server | The enabled plugins (with files the action server lacks) and the disabled ones. Anything in neither is removed. |
| `plugin-secrets` | Editor on the master's computer → master → action servers | Writes secrets. The master passes it on without storing it. |
| `list-options` / `test-plugin` | Editor → master → one action server | Dynamic options; a connection test. Answered with `action-result`. |

The master serves `ui.mjs` (and any file in the package) at `/plugins/<id>/<sha256>/<path>`.
