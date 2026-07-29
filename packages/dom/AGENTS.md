# Using @exactjs/dom

Read this package's `README.md` and exported declarations before configuring a browser root.
Use `render()` for client roots and `@exactjs/hydrate` for adopting server output.

Keep renderer ownership in eXact: use compiled events, bindings, keyed collections, portals,
`Activity`, `Suspense`, and the core `ErrorBoundary` rather than manipulating owned DOM ranges.
Use `@exactjs/dom/testing` only for renderer-aware test support.

Deliver direct and delegated events through the owning component interaction so batching,
asynchronous settlement, error ownership, and cancellation stay coordinated. Registry entry keys
are component identities: retain same-key ranges, replace different-key ranges, and discard stale
lazy candidates without disturbing compatible siblings.

For instrumented builds, use the weak root registry and `createExactDomInspectionHost()` for late
attachment, logical element ownership, and highlighting. Remove disposed roots immediately and
restore authored element styles on disconnect. Do not return `Mounted`, `Root`, component
instances, handlers, refs, or DOM mutation capabilities through the inspection host.
