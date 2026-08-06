# Forms and lists

## Component value/callback bindings

Pair a component's ordinary value and notification callback props when write-back is an
unconditional assignment:

```tsx
<Dialog open:onOpenChanged={this.state.dialogOpen} />
```

Both prop names must exist in the component's finite public prop type. The callback's required
first parameter must be writable to the state target and its return must be notification-only.
Additional parameters are ignored. Keep the explicit value-plus-callback form for validation,
transformation, refusal, logging, async acceptance, or meaningful callback results. Do not combine
the shorthand with either explicit generated prop; component callbacks are never composed.

## Native control bindings

Use `property:event={writableStateLocation}` to project state into a native DOM property and write
the control's converted value back:

```tsx
function Editor(
	this: Component<{
		name: string;
		quantity: number | null;
		published: boolean;
		delivery: 'ground' | 'express';
		carriers: ('ups' | 'usps')[];
		tags: string[];
	}>
) {
	return () => (
		<form>
			<input value:onInput={this.state.name} />
			<input type="number" value:onChange={this.state.quantity} />
			<input type="checkbox" checked:onChange={this.state.published} />

			<input type="radio" value="ground" checked:onChange={this.state.delivery} />

			<input type="checkbox" value="ups" checked:onChange={this.state.carriers} />

			<select multiple value:onChange={this.state.tags}>
				<option value="typescript">TypeScript</option>
				<option value="tsx">TSX</option>
			</select>
			<details open:onToggle={this.state.advanced}>Advanced settings</details>
		</form>
	);
}
```

Supported relationships:

- `value:onInput`: input and textarea; string, number, date, and nullable variants.
- `value:onChange`: input, textarea, select, and multi-select; scalar values or compatible arrays.
- `checked:onChange`: checkbox and radio input; boolean, radio value, or compatible checkbox arrays.
- `open:onToggle`: details; boolean disclosure state.

The bound state type controls conversion. Preserve nullable declarations when an empty control
should map to `null` or `undefined`.

Bind exactly one writable location:

```tsx
<input value:onInput={this.state.firstName} />
```

Do not bind derived expressions, combine an explicit projected property with a binding for the same
property, bind checkboxes through `value:onChange`, or omit the `value` from an array-bound checkbox.
Keep explicit handlers alongside a binding when they perform additional behavior; the binding
updates state before the same native event's JSX handler observes it.

## Keyed lists

Declare stable identity on item data:

```tsx
type Todo = {
	/** @exact key */
	id: string;
	text: string;
};

function Todos(this: Component<{ todos: Todo[] }>) {
	this.state.todos = [];

	return () => (
		<ul>
			{this.state.todos.map((todo) => (
				<li>{todo.text}</li>
			))}
		</ul>
	);
}
```

Prefer an `@exact key` annotation when one field is the type's natural identity. Use an explicit
`key={...}` when identity is local to one view, and `this.map(collection, selector, render)` when
an explicit selector is clearest or the data type cannot carry the annotation. The compiler lowers
all three forms to eXact's keyed reconciliation. String arrays use their values as keys. Treat
duplicate keys as an error rather than falling back to positional identity.

## Conditional classes

Use a namespaced prop when a static class token has a dynamic condition:

```tsx
<article className="card" className:selected={this.state.selected} />
```

Class sources compose in authored prop order. Use arrays and truthy-key objects when token names
are dynamic. Do not concatenate strings merely to express conditional static tokens.

## Coordinated form submission

`Form` is an interaction host. Use `onValidSubmit` for validated `FormData`, pass application-owned
server errors through `errors`, and use `Submit pendingText="…"` for accessible pending
presentation. The form drops duplicate submissions and remains pending through action and router
work joined to the callback. Keep expected validation failures in component state rather than
returning a framework-specific magic error object.
