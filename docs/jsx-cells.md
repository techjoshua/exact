# JSX Element Cells

JSX element cells are the planned next renderer layer after `ReactiveValue`.

The goal is to let each JSX call act as a discrete reactive render point. A component instance still runs its constructor once, and the component render function still describes the tree shape, but an already chosen JSX element should be able to rematerialize and patch its own mounted DOM span when its own tracked inputs change.

## Intended Model

- Component render scopes own structural control flow, such as choosing `<A />` or `<B />`.
- `this.map()` owns keyed list structure.
- DOM text, props, and style entries own value bindings through `unwrap()`.
- JSX element cells will own the vnode produced by a single JSX call.

When a JSX cell invalidates, the DOM renderer should patch that mounted cell subtree in place. It should not rerun the whole component instance unless the invalidated read belongs to the component render scope that chose a different tree shape.

## Runtime First

The first implementation should work with normal TypeScript automatic JSX output. A future compiler transform may optimize the same model by preserving finer expression boundaries, but compiler support is not required for v1.

## Key Scenarios

- Updating a deeply nested prop patches only the owning element cell.
- Sibling cells do not rerender for unrelated sibling state changes.
- Branch changes still rerender the scope that owns the branch.
- Existing text bindings, props, styles, refs, events, `props.children`, and `this.map()` behavior remain valid.
