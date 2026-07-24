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
