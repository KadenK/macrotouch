# Developing plugins

This guide builds and installs the copyable example in [`examples/hello-package`](../examples/hello-package).

## Build the example

The example is an ordinary package: its manifest is `package.json`, its source is `src/index.ts`, and its manifest points at the bundled `server.mjs` entry file.

From the repository root:

```sh
cd examples/hello-package
npm install
npm run build
```

`npm run build` bundles the source into `server.mjs`. The package that MacroTouch loads must contain these files at its root:

```text
package.json
server.mjs
```

The build creates two actions:

- **Say hello** is stateless. It accepts a name and writes a greeting to the Action Server log.
- **Toggle hello state** is stateful. It changes an in-memory boolean and publishes a `toggle` live state, so the macro can show On or Off and refresh while a screen is open.

## Install it

Copy the package directory, including the generated `server.mjs`, into the plugins directory under MacroTouch's data directory:

```text
<data dir>/plugins/hello-package/
  package.json
  server.mjs
```

The default data directory is `~/.macroTouch` on every platform. If `XDG_DATA_HOME` is set, MacroTouch uses that directory; if `MACROTOUCH_DATA_DIR` is set, it takes precedence over both.

If MacroTouch was started with `MACROTOUCH_DATA_DIR`, use that directory instead. Do not copy `node_modules`; the entry file is bundled so the installed package has no runtime dependency on the example's build directory.

Restart MacroTouch after copying the package. On a paired phone, open the action picker, find the **Hello package** group, and add **Say hello** or **Toggle hello state** to a macro. The action runs on the computer's Action Server, not on the phone.

## If the package does not load

Start MacroTouch from a terminal and leave that terminal open while restarting it. The Action Server's stdout and stderr are forwarded with an `[action-server]` prefix. For a direct diagnostic run, start the Action Server from the repository with the same data directory:

```sh
MACROTOUCH_DATA_DIR="<data dir>" npm run start:action
```

On PowerShell, use:

```powershell
$env:MACROTOUCH_DATA_DIR = '<data dir>'
npm run start:action
```

Read the first plugin error after startup. A package that fails validation is rejected before its code runs. A package with a valid manifest but a broken `server.mjs` is shown as a plugin error; the import error in the Action Server output identifies the source line or missing export. If the desktop app was launched from a shortcut, its Action Server output is not visible in that shortcut; launch it from a terminal for this diagnostic.

## Rejection reasons

The master and every Action Server validate the package. A package is rejected when any of these is true:

- The package is empty, is not an object, or has no root `package.json`.
- It has more than 500 files or is larger than 20 MiB.
- A path is absolute, contains `..`, `.`, empty segments, backslashes, a NUL, or is longer than 512 characters.
- Two paths differ only by case, or a path uses the reserved `.sha256` filename.
- A file is not valid base64.
- `package.json` is invalid JSON, or `name`, `version`, or `macrotouch` is missing.
- The manifest has an invalid plugin id, label, API version, platform, setting, check, or action declaration. Plugin ids use lowercase letters, digits, and hyphens, and may not start with `core-`.
- The declared server entry is missing, unsafe, or not included in the package. If a UI entry is declared, it must also be present and use a safe relative path.
- The server entry cannot be imported, does not default-export a module, or its module does not export an `actions` array. These appear as a plugin error after package validation.
- A declared face is malformed, or a package hash does not match its contents.
- Another loaded plugin already uses the same id.

The package limits are deliberate: bundle dependencies into `server.mjs` rather than shipping `node_modules`.

## API limits today

The plugin API is still experimental. MacroTouch does not promise a versioned API compatibility guarantee yet: `apiVersion: 1` identifies the current contract, but future releases may require source changes. Plugins are not sandboxed. A package runs with the same operating-system privileges as the Action Server and can execute commands, read files, access the network, and affect the computer. Install only packages you trust.

For the complete action, checks, settings, live-state, and face reference, see [`docs/plugin-system.md`](plugin-system.md).
