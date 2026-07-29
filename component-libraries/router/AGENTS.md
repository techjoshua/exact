# Using @exactjs/router

Read this package's `README.md` and choose the native entrypoint unless a React Router
compatibility facade is intentionally required.

Navigation, fetch, submit, and revalidation started synchronously inside an event, form, or action
must join the current component interaction. Preserve latest-wins navigation, cancellation,
redirects, blockers, stale-result fencing, and durable error ownership while doing so. Do not
invent a second transition or pending-state model around the router.
