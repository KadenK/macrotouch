# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Electron Build

This app packages Nuxt into Electron for desktop builds.

```bash
# npm
npm run dist
```

On Linux, `electron-builder` rebuilds native dependencies such as `@parcel/watcher`, so you need a local C++ toolchain installed before packaging. On Fedora, the minimal fix for the error shown above is:

```bash
sudo dnf install gcc-c++ make python3
```

If `.deb` packaging fails with `ruby: error while loading shared libraries: libcrypt.so.1`, install the compatibility package that provides that library:

```bash
sudo dnf install libxcrypt-compat
```

If `.rpm` packaging fails with `Need executable 'rpmbuild' to convert dir to rpm`, install the RPM build tools on Fedora:

```bash
sudo dnf install rpm-build
```

If packaging still fails after that, the next thing to check is whether the local Nuxt/Electron runtime can start without relying on a globally installed `node` or `npx`.
