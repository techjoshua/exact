# eXact

eXact is an experimental TypeScript web framework built around reactive state, component instances, and fine-grained DOM updates.

The repository is an npm workspace monorepo. The current implementation slice contains:

- `@exact/reactive`: reactive proxies, primitive wrappers, refs, tracking, batching, `unwrap`, `peek`, and snapshots.
- `@exact/core`: component instances, readonly props, context, refs, tasks, lifecycle hooks, vnodes, and `this.map()`.
- `@exact/jsx-runtime`: automatic JSX runtime entrypoints for `jsx`, `jsxs`, and `Fragment`.
- `@exact/dom`: browser mounting, DOM patching, delegated events, DOM refs, and keyed list reconciliation.

## Development

```sh
npm install
npm run build
npm test
```

## JSX

Use the automatic JSX runtime with `jsxImportSource` set to `@exact/jsx-runtime`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@exact/jsx-runtime"
  }
}
```

Browser apps mount through `@exact/dom`:

```tsx
/** @jsxImportSource @exact/jsx-runtime */
import { render } from "@exact/dom";
import type { Component } from "@exact/core";

function Counter(this: Component<{ count: number }>) {
  this.state.count = 0;

  return () => (
    <button onClick={() => this.state.count++}>
      {this.state.count}
    </button>
  );
}

render(<Counter />, document.getElementById("app")!);
```

## Keyed Lists

Use `this.map()` for lists. The framework owns the JSX `key`; item JSX should not specify it.

```tsx
function TodoList(this: Component<{ todos: { id: string; text: string }[] }>) {
  this.state.todos = [];

  return () => (
    <ul>
      {this.map(
        this.state.todos,
        todo => todo.id,
        todo => <li>{todo.text}</li>
      )}
    </ul>
  );
}
```

The key function receives only the item, not the index, so list identity stays domain-based.

## Reactive Values

Use `this.reactive` for derived values that should work anywhere state works: text, props, style entries, and task dependencies.

```tsx
function Profile(this: Component<{ firstName: string; lastName: string; saving: boolean }>) {
  const fullName = this.reactive`${this.state.firstName} ${this.state.lastName}`;
  const tone = this.reactive(() => this.state.saving == true ? "gray" : "black");

  this.task(fullName, (name, { signal }) => {
    void signal;
    console.log(name);
  });

  return () => (
    <span title={fullName} style={{ color: tone }}>
      {fullName}
    </span>
  );
}
```

Reactive values are cached after first use and recompute when their tracked dependencies change. Plain object and array replacements use structural equality, so reloading identical data does not cause unnecessary updates.

JSX elements are internally mounted through cell boundaries. These cells let the renderer patch an already chosen JSX subtree in place, while `this.reactive()` remains the public API for preserving dynamic expressions that JavaScript would otherwise evaluate before JSX runtime calls.
