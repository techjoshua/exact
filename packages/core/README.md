# @exactjs/core

Application-authoring primitives and shared runtime contracts for eXact.

## Overview

`@exactjs/core` provides component types, contexts, lifecycle APIs, refs, error boundaries,
Suspense, function-defined tasks, interactions, and finite component registries. Applications normally combine it with
`@exactjs/jsx`, an eXact compiler integration, and a renderer such as `@exactjs/dom` or
`@exactjs/ssr`.

An eXact component is a durable instance. Its outer function is a compiler-analyzed definition of
state defaults, tasks, reactive relationships, and render preparation—not a linearly executed
setup callback. The compiler turns that description into a reactive state machine; each mounted
component owns one durable instance. Local mutable data lives in `this.state`, and the returned
function contains one JSX view expression. Async outer functions are
compiler shorthand for an owned blocking initializer task. Outer-definition-local
PascalCase view arrows are lexical micro-components and share their owner rather than creating
another instance.

## Component example

```tsx
import type { Component } from '@exactjs/core';

export function Counter(this: Component<{ count: number }>) {
	this.state.count = 0;

	return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
}
```

The compiler connects each state read to the work that consumes it, so an update does not require
re-executing the component.

## Main capabilities

- Context, refs, lifecycle cleanup, Suspense, Activity, and error boundaries
- Function-defined tasks—declarations, expressions, or arrows—with optional `TaskContext`
  placement and concurrency policy
- Function-defined tasks with status, direct invocation, and synchronous optimistic state
- `createComponentRegistry()` for finite eager or lazy component selection
- `createDynamicComponent()` for intentionally open client-only providers; prefer a finite registry
  whenever the candidate set is known, and do not use open dynamic components for server work
- `createComponentDomain({ executionRoot })` for integrations that establish explicit ownership
  roots without exposing framework transport or activation capabilities
- Shared component, VNode, task, and inspection types used by framework integrations
- A realm-wide cache-backed `intl` facade; the compiler includes component localization only when
  a component uses `this.intl`, with the nearest localization context supplying the active locale
  for omitted or matching authored-source locale requests

Helpers outside a component can format through the shared pool directly:

```ts
import { intl } from '@exactjs/core';

const price = intl
	.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	})
	.format(42);
```

Compilerless component definitions that use `this.intl` must install that optional integration
explicitly with `import '@exactjs/core/localization'`. Compiled components need no such import.

Use ordinary callbacks and inferred tasks when they are sufficient. Reach for explicit policy when
work needs placement, scheduling, cancellation capabilities, a stable key, or a human-readable
identity.

Framework integrations use the `runtime/render`, `runtime/registry`, and
`framework/component-contracts` subpaths. These SPIs are absent from the application root.

## Learn more

See the [component language](../../docs/component-language.md),
[tasks](../../docs/tasks.md), [actions and forms](../../docs/actions-and-forms.md), and
[component registries](../../docs/component-registries.md) guides.
