# Using @exactjs/core

Read this package's `README.md` and exported declarations before writing application code. Treat
the installed package as authoritative when this guidance differs from another version's docs.

Prefer the least ceremonial supported form:

1. Use ordinary TypeScript expressions and direct `this.state` assignments.
2. Put setup, context, refs, lifecycle registration, and task definitions in the outer component.
3. Put reactive view calculations in the returned render function when no reusable reactive value
   is needed.
4. Use `this.reactive()` only when code needs a first-class reactive value.
5. Use an ordinary local function for coordinated work; add a final `TaskContext` only for policy
   or capabilities the compiler cannot infer.

Call task functions normally. A setup call declares initialization/reactive activation; event,
form, router, lifecycle, and direct calls create invoked work. Put placement, concurrency,
priority, readiness, keys, and detachment on the default of the final `TaskContext` parameter.
Put a reactive expression in the default of a non-context task parameter when it should be
captured once per generation without becoming an activation dependency. Prefer this input form
over a body `task.peek()` when the snapshot is unconditional and naturally names a function input;
an explicit call argument remains normally tracked.
Mutate `this.state` directly inside synchronous `task.optimistic()` blocks, register cleanup with
`task.cleanup()`, and pass `task.signal` only when inference cannot connect cancellation.

Use `@exactjs/core/tasks/v1` only for compilerless libraries and adapters. Dispose every explicit
`TaskOwner`; use `invokeTask()` after asynchronous suspension and reserve callbacks when they must
extend structural settlement. Framework packages may use
`@exactjs/core/framework/task-frames`; application code should not. Never acquire an
`ExactClient`, call low-level dispatch APIs, or author operation identifiers inside a component.
Do not author `RuntimeTaskOptions.captureArguments`; it is emitted by the
compiler to implement captured parameter defaults.

Use `Map` and `Set` directly in state. Use namespaced `className:token` props for static
conditional tokens and arrays or truthy-key objects for dynamic token names. Prefer native
`Suspense`, `Activity`, portals, and `UnsafeHtml` over application-local substitutes when their
contracts fit.

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
all sink failures from lifecycle, scheduling, tasks, and rendering.

Preserve compiler-emitted task definition and source identity. Never correlate resources by array
order, invoke a callback for inspection, or place raw callback references in a snapshot or event.
