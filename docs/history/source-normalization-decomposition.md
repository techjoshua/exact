# Native source-normalization decomposition

## Purpose

`source_normalization.go` historically combined three responsibilities: maintaining the mapping
from compiler-normalized text to authored offsets, rewriting component state destructuring, and
planning component computations. These operations must retain one ordered normalization pipeline,
but they do not need one source-file owner.

## Completed extraction

`source_edit_mapping.go` now exclusively owns source edits, their deterministic reverse ordering,
the authored-offset projection, normalization parsing, node text/span access, and normalization
diagnostic locations. `normalizeAuthoredSource()` remains the coordinator and applies exactly the
same edit plans in the same order.

The move introduces no extra AST traversal, public API, allocation model, or runtime behavior. The
284-file native compiler corpus across 22 projects passed at 1.22× its normalized performance
baseline after the extraction.

## Remaining boundaries

The remaining module should be split by behavior, without inventing a generic helper layer:

1. state-destructuring validation and rewrite planning;
2. synchronous component-computation dependency and cycle analysis;
3. async component-region planning and escape validation; and
4. the small normalization coordinator and canonical-return planning.

Each extraction must preserve edit order, authored diagnostic positions, the single compiler
analysis pipeline, and semantic corpus output. The architecture ceiling should ratchet down after
every successful move.
