# eXact

**Build the page. Let the compiler help keep its moving parts coordinated.**

Getting a page on screen is straightforward. Keeping it correct as people interact with it takes
more work. A search response arrives after the query has changed. A request keeps running after
its component disappears. A calculation falls out of sync with its inputs. Private server code
must stay out of the browser.

eXact is an experimental TypeScript and TSX framework that takes care of much of that coordination.
Its compiler connects state changes to the view and tasks that depend on them. Tasks follow their
component's lifetime, and generated client/server communication keeps permitted data flowing
between the two. You write the application's behavior; eXact manages those connections and
checks the framework's rules as it compiles.

[Create your first app](https://techjoshua.github.io/exact/#/getting-started) ·
[Why I built eXact](https://techjoshua.github.io/exact/#/story) ·
[Try Sudoku Atelier](https://techjoshua.github.io/exact/sudoku.html)

> eXact is under active development and its public APIs may change. Start with a small feature or
> prototype you can evaluate independently. Applications require the eXact compiler; familiar TSX
> comes with a component and task model to learn.

## Try it locally

```sh
npm create @exactjs/exact-app@latest my-app
cd my-app
npm run dev
```

Accept the defaults for a browser application with Vite and Vitest. Let the scaffolder install
dependencies, or run `npm install` before starting the app. Open `src/App.tsx`, change the counter,
and add a derived value like the one below. You can explore state and tasks before adding a server.

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

Clicking the button changes `count`. eXact updates the displayed count and recalculates `doubled`.
Each mounted counter keeps its own state. The component body describes the relationships the
compiler should maintain; the returned function describes the view.

## Keep asynchronous work connected to its inputs

Define a task inside its component and call it with the values that should trigger work. For
example, this excerpt from a search component runs whenever `query` changes:

```tsx
async function search(query: string, task: TaskContext = TaskContext.client()) {
	if (!query) {
		this.state.results = [];
		return;
	}
	const response = await fetch('/api/search?q=' + encodeURIComponent(query), {
		signal: task.signal
	});
	this.state.results = await response.json();
}

search(this.state.query);
```

Import `TaskContext` from `@exactjs/core`. The application supplies the query and results state,
input controls, and search endpoint. This call belongs in the component body: it runs initially
and when the query changes. eXact cancels the previous run and prevents outdated results from
being published into component state. The signal cancels the fetch. Unmounting the component
also cancels its work.

Tasks expose status for loading and error displays and support explicit concurrency and cleanup
policies. Start with the [task guide](https://techjoshua.github.io/exact/#/learn/tasks).

## Bring server work into the component

The [shipping calculator](apps/shipping-calculator) calls carrier services from a task defined
inside its component:

```tsx
function quoteProviderOnServer(
	id: ProviderId,
	request: RateRequest,
	task: TaskContext = TaskContext.server()
) {
	return quoteProvider(id, request, task.signal);
}
```

Browser-side work in that component can await `quoteProviderOnServer(id, request)`. The compiler
generates the communication, keeps the carrier helper and credentials on the server, and returns
permitted quote data to the browser. The application supplies the provider implementations and
server configuration. The [server guide](https://techjoshua.github.io/exact/#/learn/server-execution)
explains which data can cross that boundary and how rendering and hydration fit together.

For a first experiment, try direct state and a task in the browser starter. Explore server work
once that model is familiar. The optional
[React compatibility layer](https://techjoshua.github.io/exact/#/guides/react-compatibility) can
help you use existing libraries; check its supported behavior and limits before choosing a dependency.

## Packages and integrations

The framework includes routing, forms, accessibility, localization, time, theming, charts, motion,
gestures, and physics. Compiler-aware testing packages support Vitest, Jest, and Bun. Editor and
browser tools expose component state, tasks, diagnostics, and lifecycle ownership.

Build integrations support Vite, Webpack, and Bun. Server adapters cover Fetch, Node HTTP,
Express, Fastify, Hapi, Koa, Bun, Deno, Cloudflare, and serverless hosts. See the
[runtime guide](https://techjoshua.github.io/exact/#/runtimes) for setup responsibilities and limits,
and the [package map](https://techjoshua.github.io/exact/#/packages) to choose a package.

## Explore the project

- [Read the live documentation](https://techjoshua.github.io/exact/)
- [Play the live Sudoku Atelier sample](https://techjoshua.github.io/exact/sudoku.html)
- [Browse the documentation source](apps/docs/README.md)
- [Understand components and state](https://techjoshua.github.io/exact/#/learn/components)
- [Understand tasks, compiler inference, scheduling, and Suspense readiness](https://techjoshua.github.io/exact/#/learn/tasks)
- [Select finite dynamic components](https://techjoshua.github.io/exact/#/learn/component-registries)
- [Follow one component through the compiler](https://techjoshua.github.io/exact/#/learn/compiler-tour)
- [Use compiler-aware editor tooling](docs/language-tools.md)
- [Inspect running browser, server, and microfrontend components](docs/devtools.md)
- [Read about server execution](https://techjoshua.github.io/exact/#/learn/server-execution)
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
