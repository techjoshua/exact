# Using `@exactjs/core`

Use this package for eXact's application-authoring primitives; see the [README](./README.md) for
component, state, context, task, interaction, and registry examples.

- Treat the regular or async outer component function as a compiler-analyzed component definition,
  not a linearly executed callback. The compiler turns that description into the component's
  reactive state machine. Return a one-expression JSX view function and use
  outer-definition-local PascalCase arrows for owner-scoped micro-components.
- Store local mutable data in `this.state`; let the compiler track ordinary reads and writes.
- Use ordinary JSX prose spacing; HTML-like whitespace collapsing makes `{' '}` unnecessary unless
  the exact whitespace is dynamic or intentionally significant.
- Use ordinary callbacks by default. A task may use any ordinary inner-function form; add a final
  `TaskContext` policy parameter when work needs explicit placement, scheduling, concurrency,
  status, or optimistic state.
- Call function-defined tasks normally and use `createComponentRegistry()` for finite dynamic
  component selection.
- Use `createDynamicComponent()` only for intentionally open client-only providers. It cannot own
  eXact server continuations, actions, refreshes, executors, or server-homed dependencies.
- Use `this.intl` inside compiled components and the exported `intl` facade in ordinary helpers for explicitly cache-backed native formatting. Import `@exactjs/core/localization` when a compilerless component needs `this.intl`.
