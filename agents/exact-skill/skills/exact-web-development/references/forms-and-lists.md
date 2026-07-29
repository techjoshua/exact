# Forms and lists

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
			<input value:input={this.state.name} />
			<input type="number" value:change={this.state.quantity} />
			<input type="checkbox" checked:change={this.state.published} />

			<input type="radio" value="ground" checked:change={this.state.delivery} />

			<input type="checkbox" value="ups" checked:change={this.state.carriers} />

			<select multiple value:change={this.state.tags}>
				<option value="typescript">TypeScript</option>
				<option value="tsx">TSX</option>
			</select>
		</form>
	);
}
```

Supported relationships:

- `value:input`: input and textarea; string, number, date, and nullable variants.
- `value:change`: input, textarea, select, and multi-select; scalar values or compatible arrays.
- `checked:change`: checkbox and radio input; boolean, radio value, or compatible checkbox arrays.

The bound state type controls conversion. Preserve nullable declarations when an empty control
should map to `null` or `undefined`.

Bind exactly one writable location:

```tsx
<input value:input={this.state.firstName} />
```

Do not bind derived expressions, combine an explicit projected property with a binding for the same
property, bind checkboxes through `value:change`, or omit the `value` from an array-bound checkbox.
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
