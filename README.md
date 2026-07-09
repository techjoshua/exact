# eXact

eXact is an experimental TypeScript web framework built around reactive state, component instances, and fine-grained DOM updates.

The repository is an npm workspace monorepo. The current implementation slice contains:

- `@exact/reactive`: reactive proxies, refs, tracking, batching, `unwrap`, `peek`, computed values, and snapshots.
- `@exact/core`: component instances, readonly props, context, refs, tasks, lifecycle hooks, vnodes, and `this.map()`.
- `@exact/jsx-runtime`: automatic JSX runtime entrypoints for `jsx`, `jsxs`, and `Fragment`.
- `@exact/dom`: browser mounting, DOM patching, delegated events, DOM refs, and keyed list reconciliation.
- `@exact/compiler`: eXact JSX/TSX transform core for expression-preserving compiled JSX.
- `@exact/vite-plugin`: Vite integration for the eXact compiler.

## Development

```sh
npm install
npm run build
npm test
```

## JSX

The full eXact rendering model is compiler-based. Runtime JSX is still available as a structural fallback through the automatic JSX runtime with `jsxImportSource` set to `@exact/jsx-runtime`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@exact/jsx-runtime"
  }
}
```

Compiler mode is build-tool agnostic through `@exact/compiler`:

```ts
import { transformSource } from "@exact/compiler";

const result = transformSource(source, { filename: "Component.tsx" });
```

For projects that want a precompile step before their existing TypeScript build, use `exactc`:

```sh
npx exactc --rootDir src --outDir .exact src
```

That rewrites `.tsx` files to `.ts` and `.jsx` files to `.js` under the output directory, preserving relative paths. Your normal TypeScript/bundler pipeline can then compile the generated sources.

Vite is supported through a thin adapter over the same compiler:

```ts
import { exact } from "@exact/vite-plugin";

export default {
  plugins: [exact()]
};
```

The compiler preserves JSX expressions as reactive bindings, so ordinary JSX values can update at their owning text, prop, style, child, or component-prop boundary. Runtime JSX remains supported for tests and non-compiled usage, but it does not preserve arbitrary expression boundaries after JavaScript has evaluated them.

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

In compiler mode, selected API arguments are treated as reactive expression positions. This means:

```ts
const query = this.reactive(this.state.query);

query.task(async (query, { signal }) => {
  void signal;
  console.log(query);
});
```

is compiled as if it had been written with an explicit expression boundary:

```ts
const query = this.reactive(() => this.state.query);
```

`this.task(dep, ..., work)` dependency arguments are captured the same way in compiler mode. Runtime-only code should use explicit lambdas or existing reactive values when source identity matters.

Reactive state fields read as normal JavaScript values. In compiler mode, expression positions preserve the reactive source:

```ts
this.reactive(this.state.query)
this.task(this.state.query, async query => {})
```

Runtime-only code should write the expression boundary explicitly:

```ts
this.reactive(() => this.state.query)
this.reactive(() => this.state.query).task(async query => {})
```

JSX elements are internally mounted through cell boundaries. In compiler mode, expression cells and `ReactiveValue`s let the renderer patch an already chosen JSX subtree in place without rerunning unrelated component code.

## Compiled JSX Conveniences

Compiler mode supports normal fragment shorthand for unkeyed fragments:

```tsx
<>
  <span />
</>
```

Use the reserved `_` tag for keyed or prop-bearing fragments:

```tsx
<_ key={id}>
  <span />
</_>
```

Prop punning lowers a local binding into a same-named prop:

```tsx
<UserCard {user} {selected} />
```

`class` and `className` accept plain strings, arrays, and truthy maps:

```tsx
<div className="panel active" />
<div className={["panel", isActive && "active"]} />
<div className={{ panel: true, active: isActive }} />
```

`style` accepts plain CSS strings, plain objects, reactive entries, and CSS unit helpers from `@exact/dom`:

```tsx
import { percent, px, rem } from "@exact/dom";

<div style="height: 10px; margin-top: 1rem" />
<div style={{ height: "10px", marginTop: "1rem" }} />
<div style={{ height: px(this.state.height), marginTop: rem(this.state.top), width: percent(this.state.progress) }} />
```

The v1 unit helpers are `px`, `rem`, `em`, `percent`, `vh`, `vw`, `vmin`, `vmax`, `fr`, `ms`, `s`, `deg`, `rad`, and `turn`.
