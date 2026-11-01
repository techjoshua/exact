# Using `@exactjs/router`

See the [README](./README.md) for setup and examples. Use the native entry point for eXact
applications; choose a compatibility entry point only when integrating React Router code.

- Start navigation normally from links, forms, events, or tasks so it joins the current interaction.
- Let the router own cancellation, redirects, blockers, revalidation, and pending navigation state.
- Let compatibility `useFetcher()` own its request cleanup. Pair direct `router.fetch()` calls with `releaseFetcher(key)` when their owner is disposed.
- For request-backed low-level routers, supply incoming method and headers with the optional `request` option. Direct submissions and fetches accept a caller cancellation signal.
- Use route components and registries rather than building a parallel transition model.
- Use the optional publication coordinator only to wrap authoritative commit timing; keep navigation state in the router.
