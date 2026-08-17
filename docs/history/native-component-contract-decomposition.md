# Native component-contract decomposition

## Status

Completed. `component_contract_lowering.go` is below the standard Go architecture limit and no
longer has a legacy ceiling.

## Ownership

`component_contract_lowering.go` owns target-local component branding, root wrapper formation,
hoisting preservation, compatibility projection, and descriptor attachment placement.

`component_contract_metadata.go` owns descriptor AST construction for continuations, invocation
records, state effects, boundaries, resumptions, and generated contract literals/names.

The split keeps one contract-lowering pass and does not change generated metadata, operation
identity, placement, or wrapper order. Native Go tests and the semantic compiler corpus protect the
boundary.
