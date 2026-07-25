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

Use an explicit task for external effects, cleanup-returning work, deliberately nonblocking work,
or explicit placement and scheduling.

## Reactive task generations

Declare tasks directly during component setup. Prefer the compiler-inferred form:

```tsx
function Search(this: Component<SearchState>) {
	this.state.query = '';
	this.state.results = [];

	this.task(async () => {
		const query = this.state.query;
		if (!query.trim()) {
			this.state.results = [];
			return;
		}

		const response = await fetch('/api/search?q=' + encodeURIComponent(query));
		this.state.results = await response.json();
	});

	return () => <Results items={this.state.results} />;
}
```

State, prop, and reactive context reads become dependencies. The compiler captures their values
for each generation and uses those captured values throughout the callback, including after
`await`. Computed reads such as `this.state[props.key]` remain executable expressions rather than
being reduced to wildcard paths.

When a dependency changes, eXact aborts and cleans up the previous generation before owning the
replacement. Unmounting aborts the active generation. Use explicit
`this.task(dependency, work)` arguments when a dependency must be supplied indirectly.

Do not register tasks from the returned render function, event handlers, or later asynchronous
continuations.

## Owned resources

Use platform APIs directly inside compiled tasks when possible. The compiler recognizes common
cancellable calls and disposable resources, including fetches, event listeners, timers, observers,
sockets, channels, workers, subscriptions, `Symbol.dispose`, and `Symbol.asyncDispose`.

Return a cleanup function for an opaque resource:

```ts
this.task.client(() => {
	const channel = openCustomChannel();
	return () => channel.release();
});
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
this.task.client(() => browserLibrary.start());
this.task.server(() => serverLibrary.warmCache());
```

Do not use explicit placement to hide contradictory code. A server task referencing `window`, or a
client task importing a server-only module, should remain a compile error.

Before changing SSR, hydration, actions, boundary refreshes, or generated client/server artifacts,
inspect the installed `@exactjs/compiler`, `@exactjs/ssr`, `@exactjs/hydrate`, and
`@exactjs/server` APIs. These surfaces are version-sensitive and should not be reconstructed from
React Server Component assumptions.
