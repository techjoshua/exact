---
name: exact-web-development
description: Build, modify, debug, review, configure, and test web applications that use the eXact framework and @exactjs packages. Use when the user asks to create an eXact project or component, when package.json contains @exactjs/* dependencies, when TSX uses eXact Component instances or reactive this.state, or when working with eXact forms, tasks, routing, rendering, internationalization, SSR, hydration, server components, build plugins, runtime adapters, framework plugins, or server/client placement.
---

# eXact web development

Treat eXact as a compiler-led web framework with long-lived component instances and fine-grained
reactive expressions. Do not translate React patterns mechanically.

## Work from the installed version

Inspect `package.json`, the installed `@exactjs/*` package manifests, existing configuration, and
nearby source before editing. For every installed eXact package relevant to the task, read its
package-local `AGENTS.md` when present, then its `README.md` and exported declarations as needed.
Package-local guidance is versioned with the code and overrides this skill's general examples.
Prefer the project's established package versions and APIs. Do not invent React hooks, lifecycle
behavior, package exports, or server protocols that the installed eXact version does not provide.

When creating or repairing compiler configuration, read
[getting-started.md](references/getting-started.md).

## Preserve the component model

- Define an eXact component as a function whose typed `this` is `Component<State>`.
- Declare state defaults, context, refs, lifecycle, and task activation in the outer component
  definition. The compiler turns that description into a reactive state machine; do not treat the
  definition as an ordinary linearly executed callback.
- Return a render function whose body is the view expression. Keep declarations and imperative
  source control flow in the outer definition; use conditional JSX and keyed callbacks for
  view-local branching.
- Mutate `this.state` directly. Do not use `useState`, reducers, setter wrappers, or immutable
  replacement merely because the file contains JSX.
- Keep props parent-owned. Store local mutable data in `this.state`.
- Write ordinary safe initialization-derived expressions. Let the compiler preserve and cache their
  reactive dependencies; use `this.reactive()` only when an explicit reactive value is useful.
- Assign derived results directly to `this.state`. Reactive reads on the right become dependencies;
  use `peek(() => ...)` when an assignment intentionally captures a one-time snapshot.
- In an async component, await ordinary operations into state. Sequential awaits and
  `try`/`catch`/`finally` remain ordinary TypeScript while the compiler owns cancellation and
  atomic publication.
- Assume each mounted component owns one durable compiled state-machine instance; an update runs
  affected transitions rather than calling the component again.

Read [components-and-reactivity.md](references/components-and-reactivity.md) before creating
nontrivial components or translating code from another framework.

## Keep the compiler in the loop

Use an eXact build integration such as `@exactjs/vite-plugin` or the eXact compiler CLI. Configure
TypeScript with `jsxImportSource: "@exactjs/jsx"`. Uncompiled JSX cannot preserve arbitrary
expression boundaries and is not an equivalent application runtime.

Use the package scope `@exactjs`, not the former `@exact` scope.

When the installed project provides eXact Language Tools, use its
compiler-backed diagnostics and Component Semantics view to inspect initialization,
render, inferred and explicit tasks, placement, readiness, dependencies,
effects, signal injection, and cleanup. Treat those facts as compiler
authority. Do not infer eXact behavior from generated JavaScript or reproduce a
classifier in an editor or agent.

For programmatic inspection, first read the installed `@exactjs/compiler`
package-local `AGENTS.md`, then use `createExactLanguageService()` with
`noEmit: true`. Synchronize unsaved text with monotonically increasing document
versions, discard stale generations, and dispose the service. Apply only
compiler-planned refactors that still match the current generation. Entity IDs
are local diagnostic correlation values, not runtime or security identities.

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

When configuring runtime inspection, first read the installed `@exactjs/config`, build-adapter,
`@exactjs/server`, `@exactjs/devtools-runtime`, and consumer package `AGENTS.md` files. Keep
server-owned catalog output, compact client instrumentation, runtime `allowDebug`, and optional
operator identity binding separate. Never enable production inspection merely to diagnose a build
that omitted its catalog or runtime hooks.

## Prefer eXact's source simplifications

- Choose the simplest form that states the intent completely: ordinary TypeScript first,
  compiler-owned syntax second, and explicit runtime machinery only when code needs the boundary
  or policy it provides.
- Keep pure calculations as expressions. Put a calculation in `this.state` when it should be
  inspectable, and use `this.reactive()` only when another API needs a first-class reactive value.
- Use inferred DOM event types: `onInput={(event) => event.currentTarget.value}` normally needs no
  manual `Event` annotation or element cast.
- Write ordinary spaces in JSX prose. eXact follows HTML-like whitespace collapsing across
  multiline text, elements, and expressions; do not add `{' '}` merely to separate children. Use
  an explicit string expression only for dynamic or intentionally exact whitespace.
- Use `valueProp:callbackProp={this.state.path}` for a component's mechanical controlled-value
  callback when both props are finite and the callback only publishes a replacement. Write both
  props explicitly for validation, transformation, logging, async work, or callback composition.
- Use `value:onInput`, `value:onChange`, `checked:onChange`, and `open:onToggle` for supported
  intrinsic bindings when the target is one writable state location.
- Use `modal:isOpen` for writable native dialog modality. Do not combine it with the nonmodal
  `open` attribute or recreate browser top-layer and inertness behavior.
- Use `className:token={condition}` for a static conditional class token. Use a class array or
  truthy-key object when token names are dynamic; authored class sources compose in prop order.
- Use ordinary compiled `Array.map()` with an `@exact key` identity annotation, an explicit
  `key={...}` prop, or `this.map()` when an explicit selector is clearer.
- Use native-looking reactive `Map` and `Set` operations. Let compiler-generated continuations
  transport collection deltas instead of cloning or manually serializing whole collections.
- When `@exactjs/intl` is installed, keep authored TSX as the source-locale fallback and mark only
  lexical message regions, formatter values, or allowlisted human-facing intrinsic properties.
  Do not recursively absorb ordinary component output into an enclosing message; use a named
  `intl:fragment` when a component-owned range must move as an opaque exactly-once slot. Read the
  installed package's `AGENTS.md` and `README.md` before configuring catalogs or unit policy.
- When `@exactjs/theme` is installed, put generated choices on deliberate `Theme` scopes and label
  portable elements with the finite semantic enhancement roles. Use `ThemeOverride` only for CSS
  token patches; use `ThemeContext` and a deriver when specialized palettes must react to source
  changes. Read [theme.md](references/theme.md) before adding theme scopes, controls, charts, or
  package-wide theme enhancement configuration.
- When `@exactjs/charts` is installed, compose semantic labels through `Chart`, `Axis`, `Series`,
  and `Data`, give every registration a stable ID, keep the structured data view available, and use
  ordinary `intl:*` enhancements inside chart label components. Read the installed chart package's
  `AGENTS.md` and `README.md`; do not introduce a chart VNode tree or duplicate intl/theme policy.
- Use the core `<ErrorBoundary>` at ordinary recovery points. Supply a custom `fallback` for
  product-specific presentation; build directly on `ErrorContext` only for different capture or
  reset semantics.
- Define coordinated work as an ordinary local function. Call it in the outer definition
  for initialization/reactive activation or from an event, form, lifecycle,
  router, or another task for invoked activation. Use an optional final
  `TaskContext = TaskContext...` default for placement, concurrency, priority,
  readiness, detachment, cancellation, cleanup, ownership, or optimism.
- Use a defaulted non-context task parameter to capture an unconditional reactive
  input once per generation without making it an activation dependency. Keep
  explicit initialization-call arguments for tracked inputs and reserve `task.peek()` for
  conditional or mid-body snapshots.
- Keep ordinary event and form callbacks when inferred interaction ownership is sufficient. Use
  a function-defined task when code needs reactive status, direct invocation,
  placement, concurrency, deferred priority, or synchronous optimistic state.
- Use `createComponentRegistry()` for finite runtime component selection. Derive keys with
  `KeyOf<typeof Registry>` or narrow untrusted strings with `hasComponent()`; do not replace it
  with a mutable component dictionary or an untyped `createVNode()` escape.
  Pass reactive dependencies as ordinary initialization-call arguments; use parameter
  defaults for generation-stable untracked captures.
- Use `TaskContext.client()` or `TaskContext.server()` policy only when
  placement is architectural or cannot be inferred from browser/server usage.
- Treat a server task as one compiler-generated transition of the same component, not as a second
  application architecture. Resolve database, API, Apollo, TanStack Query, and other resource
  clients from server context; transport only compiler-approved public results.

Read [forms-and-lists.md](references/forms-and-lists.md) for controls, conversions, nullable
bindings, radio groups, multi-selects, checkbox groups, and list identity. Read
[accessibility.md](references/accessibility.md) before adding ARIA relationship enhancements,
focus scopes, modal bindings, or custom composite keyboard navigation. Read
[tasks-and-placement.md](references/tasks-and-placement.md) for asynchronous work and split builds.
Read [distributed-execution.md](references/distributed-execution.md) before creating or changing
server tasks, server context, SSR resumption, or client/server protocol tests.
Read [motion.md](references/motion.md) before adding prepared motion definitions, explicit motion
components, imperative playback, or optional plugin-owned motion attributes.
Read [gestures.md](references/gestures.md) before adding prepared gesture definitions, semantic
input callbacks, explicit gesture components, or optional plugin-owned gesture attributes.
Read [physics.md](references/physics.md) before adding fixed-step simulation, body commands,
force contributors, constraints, collision handling, or body DOM projection.
Read [gravity.md](references/gravity.md) before adding uniform, radial, point, bounded, or composite
fields and before registering acceleration policy with a physics world or body.

## Follow existing application structure

Prefer the router, form, and testing packages already used by the project. When adding these
capabilities, read [routing-and-testing.md](references/routing-and-testing.md). Reuse nearby eXact
components and samples as the primary style reference.

## Verify proportionally

Run the narrowest relevant typecheck, tests, and build. Treat compiler diagnostics as design
feedback: binding expressions must be writable, task placement must be consistent, keyed
identities must be stable, and owned resources must not escape their lifecycle.

Never edit or commit generated `.exact` directories or `.exact.*` files. They are disposable
compiler output, not source documentation.
