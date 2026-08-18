# Native element-island decomposition

## Status

Completed. `element_islands.go` is below the standard Go architecture limit and no longer has a
legacy ceiling.

## Ownership

`element_island_analysis.go` owns island indexing, derived/value/function capture analysis,
finite-spread inspection, server-slot detection, and placement omission decisions. It reads the
existing component analysis products and does not emit replacement AST.

`element_islands.go` owns client definition emission, capture references, finite spread
sanitization, server/client island lowering, fallback emission, and state snapshot AST.

The extraction preserves the existing indexing walk and does not introduce an additional compiler
pass. Native Go tests and the semantic compiler corpus protect the boundary.
