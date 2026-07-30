# Using @exactjs/ssr

Read this package's `README.md` and exported declarations before choosing a render entrypoint.
Choose the smallest API that satisfies the response: synchronous HTML, asynchronous HTML, or
hydratable output. Do not add hydration data when the page has no eXact-owned browser behavior.

Keep component inputs deterministic and serializable. Use compiler/runtime contracts for server
components and continuations; never invent operation IDs or depend on generated manifest shape.

Render eager and lazy registry entries through the ordinary component and Suspense pipeline.
Preserve the compiler-owned registry binding, selected key, and opaque entry identity in
hydratable component markers. Compose distributed task handlers from generated artifacts rather
than deriving endpoints from authored labels.

Request rendering should inherit the server debug runtime's owner for the exact selected
build/execution root. Keep SSR observations request-owned and value-free, release components after
render, and never retain VNodes, instances, contexts, source text, or response bodies in event
history. Explicit low-level owners remain acceptable for tests and tooling.
