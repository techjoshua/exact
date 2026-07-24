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

Do not add a JSX `key`. The compiler lowers compiled `map()` to eXact's keyed reconciliation.
String arrays use their values as keys. Use `this.map(collection, selector, render)` when the data
type cannot carry the annotation or an explicit selector improves clarity. Treat duplicate keys as
an error rather than falling back to positional identity.
