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

## A search box should not need its own request coordinator

The user types another character while a search is running. You start a new request, but the old
one may finish last and replace the correct results. Preventing that takes cancellation, guards
against late responses, loading state, and cleanup when the user leaves. The same coordination
turns up in address lookups, filters, and previews.

In eXact, a **task** is a function whose runs belong to the component. Calling it with a reactive
input connects the work to that input. When the input changes, eXact cancels the previous run,
starts another, and prevents the cancelled run from publishing component state.

Here is a complete search component. Its timer simulates a service, so you can try the behavior
without an API key.

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

The `TaskContext` parameter declares the task, and `search(this.state.query)` starts it initially
and when the query changes. `value:onInput` updates the query as you type; `taskStatus(search)`
supplies the loading indicator.

To run it:

```sh
npm create @exactjs/exact-app@latest my-app
cd my-app
npm run dev
```

Accept the defaults for a browser application with Vite and Vitest. Let the scaffolder install
dependencies, or run `npm install` first. Replace `src/App.tsx` with the component above.

Enter `p`, then add `a` while “Searching…” is visible. The search for `p` takes 800 milliseconds
and matches Paris and Portland. The search for `pa` takes 200 milliseconds and matches only Paris.
Paris should remain after the slower search finishes; its stale results cannot bring Portland back.

The timer deliberately finishes after cancellation to demonstrate that protection. With a real
data client, pass the task’s `signal` to stop its I/O too. Removing the component cancels its work.
The [task guide](https://techjoshua.github.io/exact/#/learn/tasks) explains status, errors, and cleanup.

## Call server code without writing the transport

A shipping quote needs private carrier credentials, while the address form lives in the browser.
Maintaining an endpoint, shared request types, and a client wrapper adds work before you even handle
an address changing during the request.

The component calls the quote service with an ordinary function call. When the work needs server
resources, eXact compiles the server portion into a **continuation** and generates the communication:
send the permitted inputs, run the server work, and return permitted results and state changes.
Private credentials stay on the server.

The component reads like the feature it implements: read the address, request a quote, show the
result. There is no component-specific endpoint and client request wrapper to trace or keep in sync
when that flow changes. Services can still live in shared modules. You provide authentication and
access rules; eXact handles the transport and task lifetime. The
[shipping calculator](apps/shipping-calculator) demonstrates this with carrier quotes;
[the server guide](https://techjoshua.github.io/exact/#/learn/server-execution) explains the model.

## Do less work, and start ready work sooner

Changing a shopping-cart quantity should update the total without making the browser work through
unrelated parts of the page. eXact’s compiler tracks which expressions use each piece of state and
updates the affected calculations and DOM directly. You get focused updates without manually adding
memoization to keep the rest of the page from rerendering.

On the server, a product request and a recommendations request may already have everything they
need to run together. Starting them one after another adds unnecessary delay. During server
rendering, eXact starts tasks as their inputs and scheduling capacity become available. Independent
requests can overlap across components while HTML stays in page order, reducing the wait without
manually reorganizing those requests into a shared loader.

Under load, Node also needs time to send completed pages. eXact monitors event-loop delay and how
quickly responses complete, then adjusts how much rendering work it starts at once to help keep
network traffic moving. See the [performance charts](https://techjoshua.github.io/exact/#/performance)
for measured results and [the performance reference](docs/performance.md#how-exact-reduces-work-and-waiting)
for scheduling limits.

## Share components with application-controlled capabilities

Sharing a component means supporting consumers with different build targets and feature needs.
Server execution adds another decision: which installed UI packages should be allowed to run there?

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
