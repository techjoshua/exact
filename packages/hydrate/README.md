# @exactjs/hydrate

Browser hydration and server-response patching for eXact applications.

The package reads hydration configuration, adopts server-rendered component and island markers,
invokes server actions and refreshes, applies element or range patches, and coordinates client
runtime state.

Use it with hydratable output from `@exactjs/ssr` and private contracts attached to generated
client artifacts. Hydration configuration is data, not executable application state; server
endpoints continue to validate operations, authorization, CSRF policy, and payload limits.

`HydrateOptions.onHydration` observes whether a root or client island adopted existing DOM,
mounted fresh DOM, or updated an existing hydrated root. Component resumption records restore only
compiler-declared state and shared context, and settled server work is armed without an immediate
duplicate run.

Blocking distributed continuations validate their response first, then stage authorized DOM,
component-state, and public-context changes under the task generation signal. The nearest
readiness boundary publishes that response atomically or discards it when the generation is stale.
