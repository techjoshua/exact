# Native policy-analysis decomposition

## Status

Completed. All policy-analysis modules are below the standard Go architecture limit, and the legacy
ceiling has been removed.

## Ownership

`policy.go` owns policy graph coordination, sink collection, hydration inputs, annotations,
locations, subject construction, and common policy primitives.

`policy_secret_analysis.go` owns shared state transfers, secret qualification/consumption,
consumer signatures, selector/receipt flows, and imported consumer recognition.

`policy_propagation.go` owns state/type subjects, checker-type policy projection, provider
recognition, propagation flows, callable returns, authorization checks, and task enforcement.

The split preserves the existing graph construction order and data-flow walk. Native Go tests and
the semantic compiler corpus protect policy identity, diagnostics, and task constraints.
