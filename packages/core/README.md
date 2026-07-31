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
inactive mounted subtree in `parked` or deferred `background` mode. Coordinated work is an
ordinary local function. Its optional final `TaskContext` parameter declares policy and exposes
generation capabilities:

```tsx
async function save(
	profile: Profile,
	task: TaskContext = TaskContext.server().latest().immediate()
) {
	task.optimistic(() => {
		this.state.profile = profile;
	});
	this.state.profile = await repository.save(profile, task.signal);
}
```

A setup-scope call is initialization/reactive activation; an event or direct call is invocation.
Calls under active work attach automatically to its structured task tree. Compiler-synthetic
status exposes `pending`, `pendingCount`, `generation`, `result`, `error`, and `cancel()` on an
owner-bound task function. Cleanup uses `task.cleanup()`, disposable resources use `task.own()`,
and optimism mutates `this.state` synchronously through `task.optimistic()`.

Callable task status aggregates every concurrency lane for its owner. Use
`taskStatus(task, { key })` during durable setup for a stable key-scoped view;
an uncreated or idle keyed lane reports empty status rather than inheriting
another lane's pending state, result, or error.

A reactive default on a non-context task parameter is an untracked captured
input. The compiler resolves an omitted default once per generation and passes
the result as an ordinary value; it does not subscribe the task to that read.
Explicit arguments retain normal call-site dependency tracking. Use this form
for stable generation inputs and `task.peek()` for conditional or mid-body
snapshots.

Compilerless libraries use `@exactjs/core/tasks/v1`. It exports `defineTask()`, `activateTask()`,
`invokeTask()`,
`bindTask()`, `taskStatus()`, `createTaskOwner()`, and explicit continuation/callback helpers.
The `RuntimeTaskOptions.captureArguments` hook is compiler output used to
preserve captured parameter defaults; compilerless application code should
resolve its ordinary arguments explicitly.
Framework packages use `@exactjs/core/framework/task-frames` for opaque frame capture,
reservation, cancelable execution, and synchronous restoration. A frame execution remains pending
through attached descendants and cleanup; cancelling it aborts the frame and descendants before
reporting a `cancelled` structural outcome. Structural finalizers remain attached to their parent,
and inspection retains the frame's semantic kind and optional label. Reactive consequences
invalidated during one task transition share a single structural child frame; distinct work such
as presence or motion remains an independently cancelable descendant. Application components
should prefer compiler-authored ordinary functions over either lower-level surface.

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

Current guides: [function-defined tasks](../../docs/tasks.md) and
[finite component registries](../../docs/component-registries.md).

Instrumented component domains may carry an `ExactRuntimeInspectionOwner`. While attached, it
publishes immutable lifecycle, state, props, task, render invalidation, Activity, and
Suspense observations. `inspectExactRuntimeComponent()` returns bounded previews without exposing
the durable instance, callbacks, controllers, or resources. Sink failures never participate in
application behavior. See [Server-cooperative full-stack DevTools](../../docs/devtools.md).
Inspection-instrumented compiler output uses `markExactInspectionSource()` to
associate a task function with its canonical task entity through a WeakMap.
Registration records the ID without wrapping, invoking, or exposing the
function.
