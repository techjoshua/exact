# eXact

**Ordinary TypeScript components, compiled into reactive state machines across client and server.**

eXact is an experimental, compiler-led web framework that lets you describe a component using
ordinary TypeScript and JSX, then compiles that description into a reactive state machine with
seamless client and server execution defined in the same component. Each mounted component is one
durable instance of that machine: state lives directly on it, and each state read remains connected
to the DOM or work that depends on it.

The result is ordinary-looking application code with precise updates, without a virtual DOM,
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
	// Default state for each new component instance.
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

Clicking the button mutates normal instance state and advances the compiled state machine. The
component is not called again to redescribe its interface. The compiler has already identified the
two expressions that read `count`, so only their DOM work is scheduled.

There is no setter to call, dependency array to maintain, or component tree to redescribe.

## What makes eXact different?

- **Durable components.** Each mounted component owns one inspectable instance. The outer
  function describes its state, tasks, and reactive relationships; the returned function describes
  its view.
- **Precise updates.** Read and mutate `this.state` normally. The compiler connects those reads
  to text, attributes, branches, child props, and keyed collections.
- **Owned async work.** Tasks coordinate cancellation, concurrency, optimistic state, and cleanup.
  Use ordinary callbacks when inferred ownership is sufficient, and a `TaskContext` parameter
  when work needs explicit policy.
- **Coordinated client and server execution.** Placement analysis produces paired artifacts for
  rendering, hydration, server tasks, and continuations. Generated code handles the transport.
- **Explicit React compatibility.** React-owned libraries can participate through a compatibility
  boundary while native eXact components retain their own state and update model.

## Create an app

```sh
npm create @exactjs/exact-app@latest my-app
cd my-app
npm run dev
```

The scaffolder can configure Vite, Webpack, or Bun; browser and server runtimes; Vitest, Jest, or
Bun tests; and optional React compatibility.

An eXact application uses TypeScript 7 for editor support and `exactc --check .` for
compiler-aware application checking. The
framework compiler runs as one persistent native process selected for the current operating system
and architecture.

## Packages and integrations

The framework includes routing, forms, accessibility, localization, time, theming, charts, motion,
gestures, and physics. Compiler-aware testing packages support Vitest, Jest, and Bun. Editor and
browser tools expose component state, tasks, diagnostics, and lifecycle ownership.

Build integrations support Vite, Webpack, and Bun. Server adapters cover Fetch, Node HTTP,
Express, Fastify, Hapi, Koa, Bun, Deno, Cloudflare, and serverless hosts. See the
[runtime guide](https://techjoshua.github.io/exact/runtimes) for setup responsibilities and limits,
and the [package map](https://techjoshua.github.io/exact/packages) to choose a package.

Public packages start at **0.5.0** and can release independently. Incompatible changes to the
compiled-component ABI require a new ABI epoch and major versions for its framework providers,
even before 1.0. See [release readiness](docs/release-readiness.md) for the compatibility policy.

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
- [Review the reproducible framework comparison suite](framework-comparison/README.md)

The repository also includes complete sample applications:

- [Sudoku Atelier](apps/sudoku)
- [Shipping Calculator](apps/shipping-calculator)
- [Kanban](apps/kanban)
- [Project Workbench](apps/workbench)
- [Microfrontend Portal](apps/microfrontend-portal)
- [Server Components](apps/server-components)
- [Internationalization Test Bed](apps/intl-testbed)

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
2. checks out the repository's pinned native TypeScript source when necessary;
3. tests and compiles the native eXact compiler when its inputs have changed;
4. generates application artifacts; and
5. builds every referenced package, integration, component library, and sample application.

The default development runtime is Node.js 26 (pinned in `.node-version` and `.nvmrc`), with
Bun 1.4.2 for Bun integration tests. Node.js 24 remains supported. The initial build requires
npm 11, Git, and Go 1.26.2. Native source and successful
compiler builds are retained under `.tmp`, so later builds reuse them until the pinned revision,
native overlay, target platform, or build host changes. Use
`npm run build:native-compiler -- --force` to deliberately rebuild it. Pass `--source <path>` or
set `EXACT_TYPESCRIPT_GO_SOURCE` only to use an existing checkout of the pinned
`microsoft/TypeScript` revision instead. The Go compiler lives in its `tsc` module.

Compiler changes have an additional cross-application acceptance suite:

```sh
npm run check:compiler-acceptance
```

Before contributing, read the [code maintainability standard](docs/code-maintainability.md). It
defines the repository's module ownership, documentation, testing, and change-acceptance
requirements.

## License

Copyright 2026 Joshua Friesen. eXact-owned code and documentation are licensed under
[Apache License 2.0](LICENSE). Third-party code and data retain their own notices.
See [NOTICE](NOTICE) and [licensing and attribution](docs/licensing.md).
