# MacroTouch

MacroTouch is a desktop-first macro pad for touch devices. It runs as a Nuxt 4 + Electron host on your computer, lets you define custom screens and actions, and exposes the current layout to a phone or tablet on the local network.

The usual flow is simple: connect a device over LAN, create one or more screens, and use the touch surface to trigger macros in a fullscreen runtime.

## Highlights

- Build multi-screen macro layouts.
- Pair a phone or tablet over LAN with a URL or QR code.
- Tune default screen size, colors, and swipe navigation.
- Run a fullscreen, touch-friendly runtime.
- Persist state through the websocket sync layer.
- Package the app for desktop distribution with Electron.

## How It Works

The Nuxt app provides the editor, pairing page, settings, and runtime screen. A local websocket server keeps macro state synchronized and handles macro trigger messages, while Electron packages the same app into a desktop shell.

## Run Locally

Install dependencies with your package manager of choice:

```bash
npm install
pnpm install
yarn install
bun install
```

Start the Nuxt dev server (UI, with hot reload) and the master server together:

```bash
npm run dev
```

If you want the desktop shell during development, run the Electron dev workflow instead:

```bash
npm run dev:electron
```

The web apps run on the Nuxt dev port `4321`. The master server is a separate process: its websocket is on `4322` and its HTTP API on `4323` in dev. In production the master serves the built web apps itself on `4321`.

## Scripts

- `npm run dev` - start the Nuxt dev server and the master server.
- `npm run dev:electron` - start both and launch Electron against the dev server.
- `npm run build` - generate the web apps and bundle the master server (`dist-master/`).
- `npm run build:master` - bundle only the master server.
- `npm run start:master` - run the bundled master server on its own.
- `npm run generate` - generate the static web apps into `.output/public`.
- `npm run preview` - preview the production Nuxt build locally.
- `npm run electron:preview` - build the app and open it in Electron.
- `npm run dist` - build and package the desktop application.
- `npm run typecheck:protocol` - typecheck `shared/` and `types/` with no Nuxt context.
- `npm run test:protocol` - run the websocket protocol harness against a running dev server.

## Testing

There is no unit test suite. Behavior is verified against
[`docs/regression-checklist.md`](docs/regression-checklist.md), which is the behavior contract, with
results recorded in [`docs/baseline-runs/`](docs/baseline-runs/).

The websocket protocol has an automated harness — start a dev server, then:

```bash
export MACROTOUCH_DATA_DIR=/tmp/mt-test   # keeps the run away from your real state
npm run test:protocol
```

[`docs/testing-mac-40.md`](docs/testing-mac-40.md) is the full procedure, covering both the harness
and the manual pass it cannot replace.

## Desktop Packaging

`npm run dist` uses `electron-builder` and writes artifacts to `dist-electron/`.

On Linux, packaging may require a local native toolchain because `electron-builder` rebuilds native dependencies such as `@parcel/watcher`. Install the build tools your distro expects before packaging.

- Fedora:

	```bash
	sudo dnf install gcc-c++ make python3 rpm-build
	```

- Ubuntu or Debian:

	```bash
	sudo apt update
	sudo apt install build-essential python3 make rpm
	```

If packaging still fails, confirm that the local Nuxt and Electron runtime can start without relying on a globally installed `node` or `npx`. Other Linux distributions may need equivalent packages from their own repositories.

## Project Structure

- `app/pages/` - application routes for home, connect, settings, and runtime screens.
- `app/components/` - screen, macro, input, and modal components.
- `app/stores/` - Pinia state for macros, screens, and settings.
- `master-server/` - the standalone master server: websocket gateway, state store and file, and static web server.
- `action-server/` - action implementations that can be triggered by macros, and the code that runs them.
- `electron/` - Electron main and preload entry points. Electron starts the master server if it is not already running.
- `shared/` - protocol, domain types (`shared/types/`), and platform helpers used by every process.


## License

Copyright (C) 2026 The MacroTouch contributors

MacroTouch is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE) for the full text.
