# Using @exactjs/jsx

Read this package's `README.md` and pass application TSX through the eXact compiler. The automatic
runtime and declarations are a source/tooling contract, not a virtual-DOM architecture.

Preserve `InteractionHandler` contextual typing on intrinsic DOM events so the compiler can infer
component-owned interaction lifetimes. Keep registry member and indexed component expressions as
ordinary JSX component values; do not widen their keys or insert React ownership semantics.
