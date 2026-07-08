# JSX Element Cells

JSX element cells are an internal renderer layer built on top of `ReactiveValue`.

Each JSX call produces a cell-backed vnode. A component instance still runs its constructor once, and the component render function still describes the tree shape, but an already chosen JSX element has a discrete mounted span that can be patched independently.

## Intended Model

- Component render scopes own structural control flow, such as choosing `<A />` or `<B />`.
- `this.map()` owns keyed list structure.
- DOM text, props, and style entries own value bindings through `unwrap()`.
- JSX element cells own the vnode produced by a single JSX call.

When a JSX cell is patched, the DOM renderer patches that mounted cell subtree in place. It does not rerun the whole component instance unless the invalidated read belongs to the component render scope that chose a different tree shape.

## Runtime And Compiler

The runtime JSX implementation works with normal TypeScript automatic JSX output. Compiler mode adds an eXact transform that preserves JSX expressions as reactive bindings, so ordinary JSX expressions can update at their owning text, prop, style, child, or component-prop boundary.

The compiler lowers JSX to internal core helpers. It is additive: runtime JSX remains supported, and `this.reactive()` remains useful for named/reused derived values and task dependencies.

## Key Scenarios

- Updating a deeply nested prop patches only the owning element cell.
- Sibling cells do not rerender for unrelated sibling state changes.
- Branch changes still rerender the scope that owns the branch.
- Existing text bindings, props, styles, refs, events, `props.children`, and `this.map()` behavior remain valid.
