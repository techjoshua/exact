# Using @exactjs/core

Read this package's `README.md` and exported declarations before writing application code. Treat
the installed package as authoritative when this guidance differs from another version's docs.

Prefer the least ceremonial supported form:

1. Use ordinary TypeScript expressions and direct `this.state` assignments.
2. Put setup, context, refs, lifecycle registration, and task registration in the outer component.
3. Put reactive view calculations in the returned render function when no reusable reactive value
   is needed.
4. Use `this.reactive()` only when code needs a first-class reactive value.
5. Use `this.task()` for owned effects, cleanup, nonblocking work, or explicit scheduling and
   placement—not for a pure calculation.

Use `Map` and `Set` directly in state. Use namespaced `className:token` props for static
conditional tokens and arrays or truthy-key objects for dynamic token names. Prefer native
`Suspense`, `Activity`, portals, and `UnsafeHtml` over application-local substitutes when their
contracts fit.

Register named work with `this.action()` during setup when it needs status, concurrency,
placement, priority, direct invocation, or optimistic state. Keep the final `ActionContext`
framework-owned, mutate `this.state` directly inside synchronous `optimistic()` blocks, and let
component disposal cancel active and queued generations.

Declare finite dynamic component choices with a named module-level
`createComponentRegistry()`. Derive keys with `KeyOf`, narrow untrusted strings with
`hasComponent()`, and use `preloadComponent()` rather than calling or caching lazy loaders
yourself. Registry keys are component identities, not interchangeable aliases.

Wrap ordinary application recovery points with the exported `<ErrorBoundary>`. Its default
fallback reports captured errors and offers a retry; pass a `fallback` function when the product
needs custom presentation. Build a custom boundary with `ErrorContext` and `createErrorContext`
only when capture, reporting, or reset behavior must differ.

Runtime inspection is inherited through `ComponentDomain`; never install a process-global
component registry or expose raw instances. Publish shallow, immutable, value-free transition
records only when an owner is attached, preview values through the owner's redactor, and isolate
all sink failures from lifecycle, scheduling, tasks, actions, and rendering.
