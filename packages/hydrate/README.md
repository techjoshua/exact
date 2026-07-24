# @exactjs/hydrate

Browser hydration and server-response patching for eXact applications.

The package reads hydration configuration, adopts server-rendered component and island markers,
invokes server actions and refreshes, applies element or range patches, and coordinates client
runtime state.

Use it with hydratable output from `@exactjs/ssr` and manifests emitted by the eXact compiler.
Hydration configuration is data, not executable application state; server endpoints continue to
validate actions, authorization, CSRF policy, and payload limits.
