# Tasks and placement

## Prefer assignment when work produces state

Synchronous calculations and async-component continuations do not need an explicit task wrapper:

```tsx
function Summary(this: Component<SummaryState>) {
	this.state.total = calculateTotal(this.state.items);
	return () => <output>{this.state.total}</output>;
}

async function Options(this: Component<OptionsState>) {
	this.state.options = await getOptions(this.state.destination);
	return () => <OptionsList options={this.state.options} />;
}
```

An async component may use sequential awaits and `try`/`catch`/`finally`. Its writes remain private
to the active generation and publish together after successful settlement. Framework cancellation
bypasses an ordinary catch so obsolete work cannot commit a fallback, but finally still runs.
Assign values needed by the render function to `this.state`; continuation-local variables do not
become published component state.

Use a function-defined task for external effects, cleanup, deliberately
nonblocking work, or explicit placement and scheduling.

## Reactive task generations

Define task work as an ordinary local function and call it during component
setup:

```tsx
function Search(this: Component<SearchState>) {
	this.state.query = '';
	this.state.results = [];

	const search = async (query: string, task: TaskContext = TaskContext.client().latest()) => {
		if (!query.trim()) {
			this.state.results = [];
			return;
		}

		const response = await fetch('/api/search?q=' + encodeURIComponent(query), {
			signal: task.signal
		});
		this.state.results = await response.json();
	};
	search(this.state.query);

	return () => <Results items={this.state.results} />;
}
```

State, prop, and reactive context reads become dependencies. The compiler captures their values
for each generation and uses those captured values throughout the callback, including after
`await`. Computed reads such as `this.state[props.key]` remain executable expressions rather than
being reduced to wildcard paths.

Use a defaulted non-context parameter for a reactive value that should be
sampled once per generation without triggering one:

```tsx
const search = async (
	query: string,
	filters: SearchFilters = this.state.filters,
	task: TaskContext = TaskContext.client().latest()
) => {
	await loadResults(query, filters, task.signal);
};
search(this.state.query);
```

Here `query` is tracked and `filters` is a captured input. Changing only
`filters` does not rerun the task, while the next query generation captures
the latest filters. An explicit second argument is tracked normally. Prefer
this form for unconditional inputs and use `task.peek()` for conditional or
mid-body snapshots. Captured defaults for server tasks are evaluated before
dispatch and must be serializable.

When a dependency changes, eXact aborts and cleans up the previous generation before owning the
replacement. Unmounting aborts the active generation. Use explicit
ordinary setup-call arguments when a dependency must be supplied indirectly.

Do not activate setup work from the returned render function. Calls from event
handlers or other tasks are ordinary invoked generations and attach to the
active task frame.

## Owned resources

Use platform APIs directly inside compiled tasks when possible. The compiler recognizes common
cancellable calls and disposable resources, including fetches, event listeners, timers, observers,
sockets, channels, workers, subscriptions, `Symbol.dispose`, and `Symbol.asyncDispose`.

Register an opaque cleanup through `TaskContext`:

```ts
const observeChannel = (task: TaskContext = TaskContext.client()) => {
	const channel = openCustomChannel();
	task.cleanup(() => channel.release());
};
observeChannel();
```

Do not let a generation-owned resource escape into state or an unknown owner unless the API's
lifetime contract explicitly supports it.

## Client and server placement

Let the compiler infer placement when code makes it clear:

- Browser globals and browser-only APIs imply client placement.
- Server-only imports imply server placement.
- Environment-neutral state-writing work may remain isomorphic.

Use explicit placement for opaque libraries or architectural intent:

```ts
const startBrowser = (task: TaskContext = TaskContext.client()) => browserLibrary.start();
const warmServer = (task: TaskContext = TaskContext.server()) => serverLibrary.warmCache();
startBrowser();
warmServer();
```

Do not use explicit placement to hide contradictory code. A server task referencing `window`, or a
client task importing a server-only module, should remain a compile error.

Before changing SSR, hydration, task operations, boundary refreshes, or generated client/server artifacts,
inspect the installed `@exactjs/compiler`, `@exactjs/ssr`, `@exactjs/hydrate`, and
`@exactjs/server` APIs. These surfaces are version-sensitive and should not be reconstructed from
React Server Component assumptions.
