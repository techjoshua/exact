# @exactjs/core

Application-authoring primitives and shared runtime contracts for eXact.

## Overview

`@exactjs/core` provides component types, contexts, lifecycle APIs, refs, error boundaries,
Suspense, function-defined tasks, interactions, and finite component registries. Applications normally combine it with
`@exactjs/jsx`, an eXact compiler integration, and a renderer such as `@exactjs/dom` or
`@exactjs/ssr`.

An eXact component is a durable instance. Its outer function performs setup once, local mutable
data lives in `this.state`, and the returned function contains one JSX view expression. Async
outer functions are compiler shorthand for an owned blocking initializer task. Setup-local
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
- `createComponentDomain({ executionRoot })` for integrations that establish explicit ownership
  roots without exposing framework transport or activation capabilities
- Shared component, VNode, task, and inspection types used by framework integrations

Use ordinary callbacks and inferred tasks when they are sufficient. Reach for explicit policy when
work needs placement, scheduling, cancellation capabilities, a stable key, or a human-readable
identity.

## Learn more

See the [component language](../../docs/component-language.md),
[tasks](../../docs/tasks.md), [actions and forms](../../docs/actions-and-forms.md), and
[component registries](../../docs/component-registries.md) guides.
