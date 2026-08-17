# Native source-normalization decomposition

## Purpose

`source_normalization.go` historically combined three responsibilities: maintaining the mapping
from compiler-normalized text to authored offsets, rewriting component state destructuring, and
planning component computations. These operations must retain one ordered normalization pipeline,
but they do not need one source-file owner.

## Completed extractions

`source_edit_mapping.go` now exclusively owns source edits, their deterministic reverse ordering,
the authored-offset projection, normalization parsing, node text/span access, and normalization
diagnostic locations. `normalizeAuthoredSource()` remains the coordinator and applies exactly the
same edit plans in the same order.

`component_state_destructuring_normalization.go` now owns detection of component-state aliases,
render-write rejection, destructuring-pattern planning, and the generated setter-property lowering
that preserves JavaScript defaults, rest, iterator closing, partial writes, and assignment results.

The moves introduce no extra AST traversal, public API, allocation model, or runtime behavior. The
native Go compiler tests pass, and the first extraction's 284-file corpus across 22 projects passed
at 1.22× its normalized performance baseline. `source_normalization.go` is now below the standard
Go architecture limit and no longer has a legacy exception.

## Remaining boundaries

The remaining module should be split by behavior, without inventing a generic helper layer:

1. synchronous component-computation dependency and cycle analysis;
2. async component-region planning and escape validation; and
3. the small normalization coordinator and canonical-return planning.

Each extraction must preserve edit order, authored diagnostic positions, the single compiler
analysis pipeline, and semantic corpus output. The architecture ceiling should ratchet down after
every successful move.
