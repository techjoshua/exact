# Components and reactivity

## Component shape

Read the outer function as construction and the returned function as the connected view:

```tsx
import type { Child, Component } from '@exactjs/core';

type PanelState = {
	open: boolean;
	count: number;
};

type PanelProps = {
	title: string;
	children?: Child;
};

function Panel(this: Component<PanelState>, props: PanelProps) {
	this.state.open = false;
	this.state.count = 0;

	this.onMount(() => this.log.info('Panel mounted'));

	const doubled = this.state.count * 2;

	return () => (
		<section>
			<button onClick={() => (this.state.open = !this.state.open)}>
				{props.title}: {doubled}
			</button>
			{this.state.open ? props.children : null}
		</section>
	);
}
```

The component instance owns reactive state, lifecycle, tasks, refs, context, and logging. Assigning
state invalidates only consumers that read the changed data; it does not rerun the setup function.

## Derived values

Prefer ordinary setup expressions when they are pure and compiler-analyzable:

```ts
const subtotal = this.state.quantity * this.state.price;
const total = subtotal + this.state.shipping;
```

The compiler follows pure local helpers and recognized intrinsic operations. Package APIs may
declare an equally strong contract with `@exact pure`:

```ts
/** Produces a deterministic label without external state or effects. @exact pure */
declare function formatLabel(value: string): string;
```

Treat this as a behavioral guarantee. Do not annotate calls that read clocks, randomness, mutable
globals, I/O, or other external state.

Use an explicit reactive value when runtime code needs the boundary itself:

```ts
const subtotal = this.reactive(() => this.state.quantity * this.state.price);

// Values returned by this.reactive() provide this component-owned shorthand.
subtotal.task((value, { signal }) => {
	reportEstimate(Number(value), { signal });
});
```

`this.reactive()` returns a `ComponentReactiveValue`, which extends the base `ReactiveValue` with
the `.task()` shorthand. A `ReactiveValue` created directly through `@exactjs/reactive` does not
have that method. Use the general component task form for any reactive dependency:

```ts
this.task(subtotal, (value, { signal }) => {
	reportEstimate(Number(value), { signal });
});
```

Do not wrap values in `useMemo`, `useCallback`, or ref-like boxes to preserve reactivity.

## Derived state assignments

Assign a calculation directly when its result belongs in inspectable component state:

```ts
this.state.subtotal = this.state.quantity * this.state.price;
[this.state.tax, this.state.total] = calculateTotals(this.state.subtotal, props.taxRate);
```

The compiler treats state, prop, reactive context, and safe derived reads on the right as inputs.
State locations on the left are outputs, and destructured outputs publish in one transaction. An
assignment without reactive inputs remains ordinary initialization.

Use `peek()` for an intentional one-time snapshot:

```ts
this.state.initialName = peek(() => props.name);
```

Do not create implicit feedback by reading the same target on the right. The compiler diagnoses
that cycle; use a snapshot or an explicit task according to the intended behavior.

## Context and refs

Use typed eXact context tokens with `this.setContext()` and `this.getContext()`. Use `this.ref()`
and `this.refs` for DOM references. Initialize both during setup rather than discovering them
through rerender timing.

## Event handlers

Let JSX attribute types infer the event and `currentTarget`:

```tsx
<input
	value={this.state.query}
	onInput={(event) => {
		this.state.query = event.currentTarget.value;
	}}
/>
```

Add an explicit event type only when the handler is extracted and lacks contextual typing.
