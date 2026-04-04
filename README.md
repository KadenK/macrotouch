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

Start the Nuxt development server:

```bash
npm run dev
```

If you want the desktop shell during development, run the Electron dev workflow instead:

```bash
npm run dev:electron
```

The browser app runs on Nuxt's default dev port, while the touch-device websocket flow uses port `4322`.

## Scripts

- `npm run dev` - start the Nuxt app.
- `npm run dev:electron` - start Nuxt and launch Electron against the local dev server.
- `npm run build` - build the Nuxt app for production.
- `npm run generate` - generate a static output with hash routing enabled.
- `npm run preview` - preview the production Nuxt build locally.
- `npm run electron:preview` - build the app and open it in Electron.
- `npm run dist` - build and package the desktop application.

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
- `server/` - Nitro server code, including websocket and macro handling.
- `electron/` - Electron main and preload entry points.
- `shared/` and `types/` - shared protocol and domain types.
- `util/actions` - action implementations that can be triggered by macros.

