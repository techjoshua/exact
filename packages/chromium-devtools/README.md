# eXact Chromium DevTools

A Chromium DevTools extension for inspecting running eXact applications.

## Build and install

From the repository root:

```sh
npm run build -w @exactjs/chromium-devtools
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select
`packages/chromium-devtools`. Load the package directory rather than `dist`; its manifest points
to the generated extension files.

Open DevTools and select the **eXact** panel. The extension automatically reconnects after target
navigation, page restoration, or Manifest V3 worker replacement; a manual target-page reload is
not part of normal connection recovery.

## Views

- **Components** shows every live component instance in its parent/child hierarchy. Select an
  instance to inspect state, props, contexts, tasks, dependencies, and source.
- **Profiler** records a bounded interaction window, groups activity into causal frames, and
  aggregates waterfall lanes by authored component type.
- **Microfrontends** shows independently deployed roots and their inspection availability.

Live inspection updates preserve each view's scroll position and disclosure state. Selecting a
different component keeps the tree position while starting the new instance's details at the top.
Nested value rows size their key column to bounded content instead of repeatedly reserving a fixed
share of the remaining width, keeping deeply expanded arrays and objects compact.

## Requirements

The application must be built with eXact inspection instrumentation enabled. Server-backed
inspection also requires an authorized debug session on the application's existing eXact endpoint.
The extension uses the versioned, read-only page bridge and does not evaluate caller-provided
JavaScript. While connecting, the panel distinguishes a missing page bridge from runtime
instrumentation that has not loaded yet and continues discovery automatically.
