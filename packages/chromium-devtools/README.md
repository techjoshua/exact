# eXact Chromium DevTools

Manifest V3 DevTools extension for inspecting durable eXact components across browser and server
runtimes.

The panel presents the live durable hierarchy rather than raw protocol JSON. The **Components**
view shows every component instance in parent/child order; selecting an instance exposes its
state, props, contexts, tasks, status, and dependency explanation. Its tree and details panes
scroll independently. The **Profiler** records an explicit interaction window and groups captured
work into causal frames, with state/props changes and task events aggregated into waterfall lanes
per authored component type. Stopping a capture queries retained history from the recording
cursor, closing gaps from delayed live subscription delivery. The **Microfrontends** view
summarizes independently deployed roots and availability.

Task projections preserve framework semantic kinds and optional human-facing labels so motion,
routing, and other coordinated work remain distinguishable beneath their causal parent. The panel
connects only to the versioned page hook installed by `@exactjs/devtools-runtime`; server
cooperation remains behind the page's existing authenticated eXact endpoint.

Run `npm run build -w @exactjs/chromium-devtools`, then load this directory as an unpacked extension
in Chromium. Load the package directory rather than `dist`; the committed `manifest.json` points
to generated files under `dist`. The build emits the page bridge and isolated-world content entry
as classic scripts, as required by Chromium's Manifest V3 `content_scripts` contract. It also
bundles the background worker and DevTools page entries so unpacked extension pages never depend
on bare workspace package imports. Extension reload and panel teardown fence disconnected ports
before releasing the page hook, so late bridge responses are ignored. Panel registration uses the
extension-root-relative `dist/panel.html` path referenced by the generated DevTools entry.

The extension never evaluates caller-provided JavaScript. Its only inspected-window evaluation is
the fixed `$0` owner lookup used by Chromium element selection.
