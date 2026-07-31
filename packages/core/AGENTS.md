# Using `@exactjs/core`

See the [README](./README.md) for component, state, context, task, action, and registry examples.
Use this package for eXact's application-authoring primitives.

- Treat the outer component function as setup and return a JSX-only view function.
- Store local mutable data in `this.state`; let the compiler track ordinary reads and writes.
- Use ordinary callbacks by default, `this.action()` when work needs explicit policy or identity,
  and `createComponentRegistry()` for finite dynamic component selection.
