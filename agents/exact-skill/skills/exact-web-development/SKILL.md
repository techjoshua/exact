---
name: exact-web-development
description: Build, modify, debug, review, configure, and test web applications that use the eXact framework and @exactjs packages. Use when the user asks to create an eXact project or component, when package.json contains @exactjs/* dependencies, when TSX uses eXact Component instances or reactive this.state, or when working with eXact forms, tasks, routing, rendering, SSR, hydration, server components, build plugins, runtime adapters, framework plugins, or server/client placement.
---

# eXact web development

Treat eXact as a compiler-led web framework with long-lived component instances and fine-grained
reactive expressions. Do not translate React patterns mechanically.

## Work from the installed version

Inspect `package.json`, the installed `@exactjs/*` package manifests, existing configuration, and
nearby source before editing. Prefer the project's established package versions and APIs. Do not
invent React hooks, lifecycle behavior, package exports, or server protocols that the installed
eXact version does not provide.

When creating or repairing compiler configuration, read
[getting-started.md](references/getting-started.md).

## Preserve the component model

- Define an eXact component as a function whose typed `this` is `Component<State>`.
- Initialize state, context, refs, lifecycle, and tasks in the outer setup function.
- Return a render function containing JSX.
- Mutate `this.state` directly. Do not use `useState`, reducers, setter wrappers, or immutable
  replacement merely because the file contains JSX.
- Keep props parent-owned. Store local mutable data in `this.state`.
- Write ordinary safe derived setup expressions. Let the compiler preserve and cache their
  reactive dependencies; use `this.reactive()` only when an explicit reactive value is useful.
- Assume the outer component function runs once per instance, not once per update.

Read [components-and-reactivity.md](references/components-and-reactivity.md) before creating
nontrivial components or translating code from another framework.

## Keep the compiler in the loop

Use an eXact build integration such as `@exactjs/vite-plugin` or the eXact compiler CLI. Configure
TypeScript with `jsxImportSource: "@exactjs/jsx"`. Uncompiled JSX cannot preserve arbitrary
expression boundaries and is not an equivalent application runtime.

Use the package scope `@exactjs`, not the former `@exact` scope.

## Choose rendering, build, and runtime deliberately

Decide the rendering mode before adding packages or entrypoints: client-only rendering, server
rendering without hydration, hydratable SSR, and server-component builds have different compiler
and runtime requirements. Component task placement is independent of that application-level
choice; a client task does not make an application client-only, and a server task does not
configure SSR.

Keep these integration layers distinct:

- A build plugin compiles eXact TSX and selects default, client, or server artifacts.
- A rendering package creates browser DOM or server HTML.
- A runtime adapter translates platform requests and responses for the eXact server runtime.
- An eXact framework plugin contributes bounded config/compiler/server/render/client/testing
  behavior.

Read [rendering-modes.md](references/rendering-modes.md) before creating entrypoints or changing
SSR, hydration, or server components. Read
[runtime-configuration.md](references/runtime-configuration.md) before configuring Vite, Webpack,
Bun, Node, Fetch runtimes, server frameworks, serverless targets, or eXact plugins.

## Prefer eXact's source simplifications

- Use inferred DOM event types: `onInput={(event) => event.currentTarget.value}` normally needs no
  manual `Event` annotation or element cast.
- Use `value:input`, `value:change`, and `checked:change` for supported two-way native-control
  bindings when the target is one writable state location.
- Use ordinary compiled `Array.map()` with an `@exact key` identity annotation, an explicit
  `key={...}` prop, or `this.map()` when an explicit selector is clearer.
- Use `this.task(...)` for component-owned work. Declare it during setup, let the compiler infer
  direct state, prop, and context reads, and let each generation own cancellation and cleanup.
  Pass explicit reactive dependencies only when they must be supplied indirectly.
- Use `this.task.client(...)` or `this.task.server(...)` only when placement is architectural or
  cannot be inferred from browser/server usage.

Read [forms-and-lists.md](references/forms-and-lists.md) for controls, conversions, nullable
bindings, radio groups, multi-selects, checkbox groups, and list identity. Read
[tasks-and-placement.md](references/tasks-and-placement.md) for asynchronous work and split builds.

## Follow existing application structure

Prefer the router, form, and testing packages already used by the project. When adding these
capabilities, read [routing-and-testing.md](references/routing-and-testing.md). Reuse nearby eXact
components and samples as the primary style reference.

## Verify proportionally

Run the narrowest relevant typecheck, tests, and build. Treat compiler diagnostics as design
feedback: binding expressions must be writable, task placement must be consistent, keyed
identities must be stable, and owned resources must not escape their lifecycle.
