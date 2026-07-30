# eXact Chromium DevTools

Manifest V3 DevTools extension for inspecting durable eXact components across browser and server
runtimes.

The panel provides Components, State/Context, Tasks, Dependencies, Timeline, and
Microfrontends projections. It connects only to the versioned page hook installed by
`@exactjs/devtools-runtime`; server cooperation remains behind the page’s existing authenticated
eXact endpoint.

Run `npm run build -w @exactjs/chromium-devtools`, then load this directory as an unpacked extension
in Chromium. The committed `manifest.json` points to generated files under `dist`.

The extension never evaluates caller-provided JavaScript. Its only inspected-window evaluation is
the fixed `$0` owner lookup used by Chromium element selection.
