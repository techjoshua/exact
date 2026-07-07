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
