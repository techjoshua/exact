# Using `@exactjs/core`

Use this package for application-authoring primitives. See the [README](./README.md) for examples.

- Treat the outer function as a compiler-analyzed reactive state machine definition.
  Return one JSX view expression; local PascalCase view arrows are owner-scoped micro-components.
- Store local mutable data in `this.state`; let the compiler track ordinary reads and writes.
- Use `@exactjs/core/children` for immediate-child composition; do not inspect opaque render receipts.
- Use `Document` from `@exactjs/core/document` for document defaults; hydrate the root for reactive fields.
- Use ordinary JSX prose spacing; explicit whitespace is only needed for intentionally exact spacing.
- Use ordinary callbacks by default. Function tasks accept a final `TaskContext` policy parameter
  for placement, scheduling, concurrency, status, or optimistic state. Invoke them normally.
- Use `createComponentRegistry()` for finite dynamic component selection.
- Use `createDynamicComponent()` only for open client-only providers, never for server continuations,
  actions, refreshes, executors, or server-homed dependencies.
- Use `this.intl` in compiled components and the exported `intl` facade in ordinary helpers for cached formatting.
- Use `TaskContext.client().progress()` only for missable server-task snapshots. Receivers may be async;
  rely on the server result for completion and required effects. See the [progress contract](../../docs/tasks.md#server-task-progress).
