# Using @exactjs/ssr

Read this package's `README.md` and exported declarations before choosing a render entrypoint.
Choose the smallest API that satisfies the response: synchronous HTML, asynchronous HTML, or
hydratable output. Do not add hydration data when the page has no eXact-owned browser behavior.

Keep component inputs deterministic and serializable. Use compiler/runtime contracts for server
components and continuations; never invent operation IDs or depend on generated manifest shape.

Emit eager boundaries for nested SSR components that own distributed
continuations. Keep ordinary state-only resumption in normal tree adoption;
do not promote every resumption descriptor into a standalone island. Snapshot
activation props without evaluating reactive cells, tracking dependencies, or
invoking accessors. Permit repeated plain-data references in hydration payloads
while rejecting active cycles and unsupported prototypes.

Render eager and lazy registry entries through the ordinary component and Suspense pipeline.
Preserve the compiler-owned registry binding, selected key, and opaque entry identity in
hydratable component markers. Compose distributed task handlers from generated artifacts rather
than deriving endpoints from authored labels.

Use the string value of the compiled `@exactjs/component` brand in ordinary hydratable component
markers so DOM adoption and resumption validate one protocol identity. Reject unbranded function
components; never substitute a function or display name for compiler-owned identity.

Request rendering should inherit the server debug runtime's owner for the exact selected
build/execution root. Keep SSR observations request-owned and value-free, release components after
render, and never retain VNodes, instances, contexts, source text, or response bodies in event
history. Explicit low-level owners remain acceptable for tests and tooling.
