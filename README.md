# eXact

**Reactive TypeScript without rerunning your components.**

eXact is an experimental, compiler-led web framework for building interfaces with familiar
TypeScript and JSX. A component is a long-lived instance: setup runs once, state lives directly on
the instance, and the compiler connects each state read to the DOM or work that depends on it.

The result is ordinary-looking application code with precise updates—without a virtual DOM,
positional Hooks, or a general component rerender loop.

> eXact is under active development. The framework is ready to explore and contribute to, but its
> public API may still change.

[Read the documentation](https://techjoshua.github.io/exact/) ·
[Play Sudoku Atelier](https://techjoshua.github.io/exact/sudoku.html)

## A component at a glance

```tsx
import type { Component } from '@exactjs/core';

type CounterState = {
	count: number;
};

export function Counter(this: Component<CounterState>) {
	// Setup runs once for this component instance.
	this.state.count = 0;

	// This remains connected to count; it is not a one-time snapshot.
	const doubled = this.state.count * 2;

	return () => (
		<section>
			<h1>Count: {this.state.count}</h1>
			<p>Twice that is {doubled}</p>
			<button onClick={() => this.state.count++}>Add one</button>
		</section>
	);
}
```

Clicking the button mutates normal instance state. The component function does not execute again.
The compiler has already identified the two expressions that read `count`, so only their DOM work
is scheduled.

There is no setter to call, dependency array to maintain, or component tree to redescribe.

## What makes eXact different?

### Components are durable instances

The outer component function is setup, not a render callback. State, tasks, refs, contexts, owned
resources, and lifecycle registrations all belong to one inspectable instance. The returned
function describes its view.

### Reactivity follows ordinary expressions

Read and write `this.state` directly. Derived values can remain normal TypeScript expressions. The
compiler preserves the relationships between state and text, attributes, styles, branches,
component props, and keyed collections.

Setup-derived values can share one lazy result across the component. View-local
calculations stay with their consuming reactive region, and the compiler elides
an otherwise unnecessary setup cell for safe single-consumer calculations that
produce a scalar or forward an existing identity. Explicit `this.reactive()`
values remain durable first-class boundaries.

Initial synchronous derived-state calculations settle before the first render, so required child
props never observe an intermediate uninitialized value.

### Updates stay close to what changed

eXact does not rerun the component to produce another virtual tree. Generated code updates the
specific expression or structural range affected by a change while preserving component and DOM
identity.

### Async work has an owner

Ordinary local functions become structured tasks when their effects or activation require
coordination. Reactive and invoked work share lifecycle, cancellation, cleanup, concurrency,
optimism, placement, and error ownership without separate task/action wrappers. The compiler
supplies generation cancellation to discoverable `AbortSignal` parameters and owns local
disposable resources when their cleanup contract is visible.

### Client and server use one model

The compiler analyzes placement, produces client and server artifacts, and coordinates hydration,
actions, continuations, cancellation, and secure server dispatch. Application code expresses the
operation; generated code owns the transport plumbing.

eXact deliberately uses familiar TSX without adopting React's runtime architecture. React
compatibility is available for React-owned libraries and migration boundaries, while native eXact
components keep the setup-once model.

## Create an app

```sh
npm create @exactjs/exact-app@latest my-app
cd my-app
npm run dev
```

The scaffolder can configure Vite, Webpack, or Bun; browser and server runtimes; Vitest, Jest, or
Bun tests; and optional React compatibility.

An eXact application uses TypeScript 7 for editor support and command-line type checking. The
framework compiler runs as one persistent native process selected for the current operating system
and architecture.

## What is available today?

- Fine-grained reactive state, derived values, DOM updates, and keyed collections
- Long-lived component instances with context, refs, lifecycle, tasks, and cleanup
- Function-defined tasks with typed server results, compiler-owned opaque dispatch, cancellation,
  keyed concurrency with aggregate or lane-scoped status, optimistic state, forms, navigation,
  and generation-stable captured parameter defaults, plus cancelable, inspectable framework task
  frames for router and motion coordination. Tasks share one model whether policy is inferred or
  authored on a final `TaskContext` parameter.
- Finite eager/lazy component registries with compiler-checked identity, placement, SSR, and hydration
- Browser rendering, SSR, streaming, hydration, server actions, and component continuations
- Vite, Webpack, and Bun compiler integrations
- Compiler-aware language tools with a no-emit project service, LSP server, and VS Code client,
  including syntax-preserving semantic tokens, linked derived assignment/use badges, precise
  function-task and referenced-component hovers, and operation-local badges with authored task
  dependencies and version-fenced, framework-only diagnostics using current function-defined task
  guidance
- Optional server-cooperative Chromium DevTools with self-contained, lifecycle-safe Manifest V3
  entries, ordered client-root ownership across compiled reactive cells, client-only local
  sessions, a live component-instance tree, bounded causal-frame profiling with aggregated
  component-type waterfall lanes, root-correct panel registration, and a read-only CDP agent
- Routing, accessible form primitives, and compiler-aware component testing
- React 18 and 19 compatibility for React-owned code
- Node, Fetch, Express, Fastify, Hapi, Koa, Bun, Deno, Cloudflare, and serverless runtime adapters

The package-specific READMEs describe the supported APIs and environment boundaries in detail.

## Explore the project

- [Read the live documentation](https://techjoshua.github.io/exact/)
- [Play the live Sudoku Atelier sample](https://techjoshua.github.io/exact/sudoku.html)
- [Browse the documentation source](apps/docs/README.md)
- [Understand components and state](apps/docs/src/pages/ComponentsPage.tsx)
- [Understand tasks, compiler inference, scheduling, and Suspense readiness](apps/docs/src/pages/TasksPage.tsx)
- [Select finite dynamic components](apps/docs/src/pages/ComponentRegistriesPage.tsx)
- [Follow one component through the compiler](apps/docs/src/pages/CompilerTourPage.tsx)
- [Use compiler-aware editor tooling](docs/language-tools.md)
- [Inspect running browser, server, and microfrontend components](docs/devtools.md)
- [Read about server execution](apps/docs/src/pages/ServerExecutionPage.tsx)
- [Review the native compiler architecture](docs/native-compiler.md)
- [Browse the current engineering references](docs/README.md)

The repository also includes complete sample applications:

- [Sudoku Atelier](apps/sudoku)
- [Shipping Calculator](apps/shipping-calculator)
- [Kanban](apps/kanban)
- [Project Workbench](apps/workbench)
- [Microfrontend Portal](apps/microfrontend-portal)
- [Server Components](apps/server-components)

The native samples follow the setup-once component model: state stays directly inspectable,
reactive calls define task dependencies, concurrent work attaches as child tasks, and timers,
subscriptions, and other resources remain generation-owned.

From a repository checkout, try:

```sh
npm install
npm run build
npm run dev:sudoku
```

To build and open the VS Code language-tools Extension Development Host:

```sh
npm run dev:vscode-extension
```

## Work on eXact

This repository is an npm workspace monorepo containing the compiler, runtimes, integrations,
component libraries, tests, documentation, and examples.

```sh
npm install
npm run build
npm test
```

`npm run build` is the complete local build. It:

1. builds the core workspace prerequisite used by native semantic tests;
2. checks out the repository's pinned TypeScript-Go source when necessary;
3. tests and compiles the native eXact compiler when its inputs have changed;
4. generates application artifacts; and
5. builds every referenced package, integration, component library, and sample application.

The initial build requires Node.js 24, npm 11, Git, and Go 1.26.2. Native source and successful
compiler builds are retained under `.tmp`, so later builds reuse them until the pinned revision,
native overlay, target platform, or build host changes. Use
`npm run build:native-compiler -- --force` to deliberately rebuild it. Pass `--source <path>` or
set `EXACT_TYPESCRIPT_GO_SOURCE` only to use an existing TypeScript-Go checkout instead.

Compiler changes have an additional cross-application acceptance suite:

```sh
npm run check:compiler-acceptance
```

Before contributing, read the [code maintainability standard](docs/code-maintainability.md). It
defines the repository's module ownership, documentation, testing, and change-acceptance
requirements.
