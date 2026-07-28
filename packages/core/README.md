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

Renderer packages share `normalizeClassValue()` so native DOM updates, SSR markup, and hydration
apply the same ordered string, nested-array, truthy-map, and reactive-value class contract.
Application TSX normally reaches that helper through compiled `className` values rather than
calling it directly.

Reactive component state supports ordinary `Map` and `Set` reads, iteration, and mutators.
Hydration and server operations encode them as tagged JSON values and restore real collections;
generated continuations use ordered entry deltas so a changed Map key or Set membership does not
require returning the complete collection.
