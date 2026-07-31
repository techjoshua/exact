# Using @exactjs/router

Read this package's `README.md` and choose the native entrypoint unless a React Router
compatibility facade is intentionally required.

Navigation, fetch, submit, and revalidation started synchronously inside an event, form, or task
must join the current component interaction task frame. Preserve latest-wins navigation, cancellation,
redirects, blockers, stale-result fencing, and durable error ownership while doing so. Do not
invent a second transition or pending-state model around the router.

Keep prop destructuring, route matching, and link presentation in setup. Return
only a view expression from render functions; use a named pure helper for a
setup-derived projection rather than imperative render-body control flow.

Keep compilerless native router components branded through `markExactComponent()` with stable
`@exactjs/router:` identities. Do not restore function-name or shape-based ownership fallbacks.
Compile authored native test fixtures through the package Vitest configuration. Leave React facade
fixtures unbranded so they exercise the real compatibility boundary.
