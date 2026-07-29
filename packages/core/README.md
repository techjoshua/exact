# @exactjs/core

Core component, virtual-node, context, lifecycle, task, ref, error-boundary, and compiled-runtime
contracts for eXact.

```tsx
import type { Component } from '@exactjs/core';

export function Counter(this: Component<{ count: number }>) {
	this.state.count = 0;
	return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
}
```

Application code normally combines this package with `@exactjs/jsx`, a renderer such as
`@exactjs/dom` or `@exactjs/ssr`, and an eXact compiler integration. The outer component function
runs once per instance; its returned render function and compiled expression cells stay reactive.

`Suspense` coordinates compiler-owned blocking task generations, while `Activity` retains an
inactive mounted subtree in `parked` or deferred `background` mode. Task policy facets compose:
`this.task.server.deferred.blocking(...)` independently selects placement, scheduling priority,
and readiness.

Use `this.action()` for named, inspectable component work with `parallel`, `latest`, or `queue`
concurrency. Placement and scheduling facets compose:

```tsx
const save = this.action.server.deferred(
	'save profile',
	async (profile, { optimistic, signal }) => {
		optimistic(() => {
			this.state.profile = profile;
		});
		this.state.profile = await repository.save(profile, { signal });
	},
	'latest'
);
```

The returned action exposes reactive pending/result/error status and owns cancellation,
optimistic rollback, and component disposal. `inspectComponentActions()` returns immutable
diagnostic snapshots without exposing work callbacks or protocol IDs. A compiled server action
preserves its authored return type: application code calls the returned function normally and
never needs the transport client or a generated continuation identifier.

`createComponentRegistry()` declares a finite immutable set of eager and lazy components.
Registry members are stable component facades, `KeyOf<typeof Registry>` derives the key union,
`hasComponent()` narrows untrusted strings, and `preloadComponent()` deduplicates lazy loading.
Compiled registries carry opaque identity into SSR/hydration markers; a mismatched selected entry
is recovered inside its own range. `inspectComponentRegistry()` reports entry mode, status, and
load generation without exposing loaders.

`ErrorBoundary` supplies an application-level recovery point without requiring every project to
rebuild `ErrorContext` plumbing:

```tsx
<ErrorBoundary
	fallback={({ error, reset }) => (
		<section role="alert">
			<p>{String(error.error)}</p>
			<button onClick={reset}>Try again</button>
		</section>
	)}
>
	<App />
</ErrorBoundary>
```

Omit `fallback` for the framework's simple report-and-retry view. Use `ErrorContext` and
`createErrorContext()` directly when an application needs different capture or reporting behavior.

Renderer packages share `normalizeClassValue()` so native DOM updates, SSR markup, and hydration
apply the same ordered string, nested-array, truthy-map, and reactive-value class contract.
Application TSX normally reaches that helper through compiled `className` values rather than
calling it directly.

Reactive component state supports ordinary `Map` and `Set` reads, iteration, and mutators.
Hydration and server operations encode them as tagged JSON values and restore real collections;
generated continuations use ordered entry deltas so a changed Map key or Set membership does not
require returning the complete collection.

Current guides: [actions and forms](../../docs/actions-and-forms.md) and
[finite component registries](../../docs/component-registries.md).

Instrumented component domains may carry an `ExactRuntimeInspectionOwner`. While attached, it
publishes immutable lifecycle, state, props, task, action, render invalidation, Activity, and
Suspense observations. `inspectExactRuntimeComponent()` returns bounded previews without exposing
the durable instance, callbacks, controllers, or resources. Sink failures never participate in
application behavior. See [Server-cooperative full-stack DevTools](../../docs/devtools.md).
Inspection-instrumented compiler output uses `markExactInspectionSource()` to associate a callback
with its canonical task/action entity through a WeakMap. Registration records the ID without
wrapping, invoking, or exposing the callback.
