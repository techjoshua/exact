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

After reloading the target page, open DevTools and select the **eXact** panel.

## Views

- **Components** shows every live component instance in its parent/child hierarchy. Select an
  instance to inspect state, props, contexts, tasks, dependencies, and source.
- **Profiler** records a bounded interaction window, groups activity into causal frames, and
  aggregates waterfall lanes by authored component type.
- **Microfrontends** shows independently deployed roots and their inspection availability.

Live inspection updates preserve each view's scroll position and disclosure state. Selecting a
different component keeps the tree position while starting the new instance's details at the top.

## Requirements

The application must be built with eXact inspection instrumentation enabled. Server-backed
inspection also requires an authorized debug session on the application's existing eXact endpoint.
The extension uses the versioned, read-only page bridge and does not evaluate caller-provided
JavaScript.
