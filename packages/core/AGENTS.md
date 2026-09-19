# Using `@exactjs/core`

Use this package for eXact's application-authoring primitives; see the [README](./README.md) for
component, state, context, task, interaction, and registry examples.

- Treat the outer function as a compiler-analyzed definition of a reactive state machine.
  Return one JSX view expression; local PascalCase view arrows are owner-scoped micro-components.
- Store local mutable data in `this.state`; let the compiler track ordinary reads and writes.
- Use `@exactjs/core/children` for immediate-child composition; do not inspect opaque render receipts.
- Use `Document` from `@exactjs/core/document` for document defaults; hydrate the root for reactive document fields.
- Use ordinary JSX prose spacing; HTML-like whitespace collapsing makes `{' '}` unnecessary unless
  the exact whitespace is dynamic or intentionally significant.
- Use ordinary callbacks by default. A task may use any ordinary inner-function form; add a final
  `TaskContext` policy parameter when work needs explicit placement, scheduling, concurrency,
  status, or optimistic state.
- Call function-defined tasks normally and use `createComponentRegistry()` for finite dynamic
  component selection.
- Use `createDynamicComponent()` only for intentionally open client-only providers. It cannot own
  eXact server continuations, actions, refreshes, executors, or server-homed dependencies.
- Use `this.intl` inside compiled components and the exported `intl` facade in ordinary helpers for explicitly cache-backed native formatting.
