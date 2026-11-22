# Hello package

This is the smallest package that demonstrates both plugin action styles:

- **Say hello** is stateless. It accepts a name and logs a greeting.
- **Toggle hello state** is stateful. It toggles an in-memory value and exposes that value as live state.

From this directory, install the build dependency and create the bundled entry file:

```sh
npm install
npm run build
```

The resulting `server.mjs` is the file loaded by MacroTouch. See [`docs/plugins.md`](../../docs/plugins.md) for installation instructions.
