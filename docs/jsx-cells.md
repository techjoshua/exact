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

Runtime JSX works with normal TypeScript automatic JSX output and remains useful for structural tests and simple non-compiled usage. The full reactive rendering model is compiler mode: the eXact transform preserves JSX expressions and selected API arguments as reactive bindings, so ordinary expressions can update at their owning text, prop, style, child, or component-prop boundary.

The compiler lowers JSX and captured API expression positions to internal core helpers. Runtime JSX does not attempt to recover source identity from already-evaluated primitive values; runtime-only code should use explicit lambdas or existing `ReactiveValue`s when it needs expression capture.

## Key Scenarios

- Updating a deeply nested prop patches only the owning element cell.
- Sibling cells do not rerender for unrelated sibling state changes.
- Branch changes still rerender the scope that owns the branch.
- Existing text bindings, props, styles, refs, events, `props.children`, and `this.map()` behavior remain valid.
