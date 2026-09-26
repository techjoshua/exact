# eXact

**Make interactive applications easier to get right, from browser to server.**

Getting a page on screen is straightforward. Keeping it correct as people interact with it takes
more work. Queries change before requests finish. Components disappear while work is running.
Server operations need private credentials.

eXact is an experimental TypeScript and TSX framework. Its compiler connects state to the view and
tasks that depend on it, owns their lifetime, and coordinates client and server execution. Each
mounted component keeps one inspectable instance of its state and work.

[Try the live search example](https://techjoshua.github.io/exact/) ·
[Why I built eXact](https://techjoshua.github.io/exact/#/story) ·
[Play Sudoku Atelier](https://techjoshua.github.io/exact/sudoku.html)

## Try one component

```sh
npm create @exactjs/exact-app@latest my-app
cd my-app
npm run dev
```

Accept the defaults for a browser application with Vite and Vitest. Let the scaffolder install
dependencies, or run `npm install` first. Replace `src/App.tsx` with this complete example:

```tsx
import { TaskContext, taskStatus, type Component } from '@exactjs/core';

const destinations = ['Lisbon', 'London', 'Los Angeles', 'Oslo', 'Paris', 'Portland'];
type SearchState = { query: string; results: string[] };

/** Demonstrates input-driven asynchronous work without requiring a server or API key. */
export function App(this: Component<SearchState>) {
	this.state.query = '';
	this.state.results = [];

	const search = async (query: string, _task: TaskContext = TaskContext.client()) => {
		// Simulate a slow first request and faster subsequent requests.
		await new Promise<void>((resolve) => {
			setTimeout(resolve, query.length === 1 ? 800 : 200);
		});
		this.state.results = query
			? destinations.filter((name) => name.toLowerCase().includes(query.toLowerCase()))
			: [];
	};
	void search(this.state.query);
	const status = taskStatus(search);

	return () => (
		<section aria-label="Destination search">
			<label>
				Destination
				<input type="search" value:onInput={this.state.query} />
			</label>
			<p role="status">{status.pending ? 'Searching…' : 'Search complete'}</p>
			<ul>
				{this.state.results.map((name) => (
					<li key={name}>{name}</li>
				))}
			</ul>
		</section>
	);
}
```

Type `l`, then quickly add `i`. The demo simulates a slow first search. The call
`search(this.state.query)` starts work initially and when the query changes; eXact cancels the
previous run, keeping the results attached to the current query. Removing the component cancels
its work too. With a real data client, pass `task.signal` to stop its I/O. The
[task guide](https://techjoshua.github.io/exact/#/learn/tasks) explains status, errors, and cleanup.

## Keep the client and server parts together

Define server tasks alongside the view and browser interactions that use them. The compiler
generates their communication, keeps private server resources out of the browser, and checks data
crossing the boundary. Shared services can still live in ordinary modules. The
[shipping calculator](apps/shipping-calculator) demonstrates this with carrier quotes;
[the server guide](https://techjoshua.github.io/exact/#/learn/server-execution) explains the model.

## Do less work, and start ready work sooner

Browser updates target expressions and DOM regions that depend on changed state. During SSR,
tasks become eligible as their inputs become available and start when a concurrency slot is free.
Supported compiled components can prepare independent child work before earlier tasks finish,
while keeping HTML in page order. Actual data dependencies and conditional selection still apply.

The Node adapter monitors event-loop delay and completed-response throughput, adjusting rendering
admission and yielding so network I/O can progress under load. See the
[performance charts](https://techjoshua.github.io/exact/#/performance) for measured results and
[the performance reference](docs/performance.md#how-exact-reduces-work-and-waiting) for limits.

## Share components with application-controlled capabilities

A chart library can offer optional motion while each application chooses whether to enable it.
`exactc build-library` produces client and server modules, declarations, and package metadata.
Applications also authorize which component libraries may execute on their server. Approved
libraries run with the process's permissions, so review remains part of adopting them.
See [library distribution and authorization](https://techjoshua.github.io/exact/#/components/trust)
and [optional enhancements](https://techjoshua.github.io/exact/#/components/enhancements).

## Less plumbing to maintain

- No dependency arrays for derived values and reactive tasks.
- No endpoint and client request wrapper for each component's server task.
- No GraphQL schema or resolvers required just to connect those tasks.
- No task-lifetime bookkeeping or stale-result guards for compiler-managed state updates.
- No custom compiler pipeline for a supported component library.

You supply task inputs, business logic, authentication, and access rules. Existing APIs and
GraphQL services can remain part of your application.

## Choose a first project

eXact is experimental and its public APIs may change. Start with a small feature or prototype you
can evaluate independently. Applications require the eXact compiler and have their own component
and task semantics to learn.

The [quick start](https://techjoshua.github.io/exact/#/getting-started) covers setup. Check
[runtime support](https://techjoshua.github.io/exact/#/runtimes) for your deployment and
[React compatibility](https://techjoshua.github.io/exact/#/guides/react-compatibility) for existing
libraries. The [package guide](https://techjoshua.github.io/exact/#/packages) covers routing, forms,
theming, accessibility, internationalization, and other integrations.

For larger examples, explore [Sudoku Atelier](apps/sudoku), the
[Shipping Calculator](apps/shipping-calculator), and [other sample applications](https://techjoshua.github.io/exact/#/samples).
Contributors can start with the [engineering references](docs/README.md).

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
