# Using @exactjs/dom

Read this package's `README.md` and exported declarations before configuring a browser root.
Use `render()` for client roots and `@exactjs/hydrate` for adopting server output.

Keep renderer ownership in eXact: use compiled events, bindings, keyed collections, portals,
`Activity`, `Suspense`, and the core `ErrorBoundary` rather than manipulating owned DOM ranges.
Use `@exactjs/dom/testing` only for renderer-aware test support.

Require the non-empty `@exactjs/component` identity brand before mounting or adopting a
function-valued native VNode. Do not restore function-name or shape-based ownership fallbacks;
foreign component systems cross their compatibility adapter.

Preserve the construction barrier between component setup and first rendering. Normal-priority
synchronous setup activations must settle before rendering the component or mounting its children,
while deferred work must retain its authored scheduling policy.

Deliver direct and delegated events through an interaction-activated root task frame so batching,
renderer consequences, structural settlement, error ownership, and cancellation stay coordinated.
Registry entry keys
are component identities: retain same-key ranges, replace different-key ranges, and discard stale
lazy candidates without disturbing compatible siblings.

Authorize `withComponentResumption()` only around construction whose SSR marker matches the
component's compiler contract identity. Do not carry that authority through rendering or into
mismatch recovery; fresh mounts must never consume a hydration domain's remaining records.

For instrumented builds, use the weak root registry and `createExactDomInspectionHost()` for late
attachment, logical element ownership, and highlighting. Remove disposed roots immediately and
restore authored element styles on disconnect. Keep compiler-generated cell wrappers transparent
to immutable component domains, including inspection ownership attached at the browser root. Do
not return `Mounted`, `Root`, component instances, handlers, refs, or DOM mutation capabilities
through the inspection host.
