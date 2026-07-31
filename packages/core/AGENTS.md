# Using `@exactjs/core`

See the [README](./README.md) for component, state, context, task, interaction, and registry examples.
Use this package for eXact's application-authoring primitives.

- Treat the outer component function as setup and return a JSX-only view function.
- Store local mutable data in `this.state`; let the compiler track ordinary reads and writes.
- Use ordinary callbacks by default. Define an inner function with a `TaskContext` policy parameter
  when work needs explicit placement, scheduling, concurrency, status, or optimistic state.
- Call function-defined tasks normally and use `createComponentRegistry()` for finite dynamic
  component selection.
