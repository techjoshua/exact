# Native callable-effects decomposition

## Status

Completed. The callable analysis modules are below the standard Go architecture limit, and the
legacy ceiling has been removed.

## Ownership

`callable_effects.go` owns callable graph discovery, project cache coordination, identity/alias
binding, and immutable analysis assembly.

`callable_direct_effects.go` owns direct state, context, environment, receiver, parameter, and call
target fact collection for a callable.

`callable_effect_resolution.go` owns context/environment classification, fixed-point propagation,
artifact constraints, deduplication, module-initializer diagnostics, and stable signatures.

The split preserves the same graph, cache fingerprints, fixed-point order, and source walks. Native
Go tests and the semantic compiler corpus protect these contracts.
