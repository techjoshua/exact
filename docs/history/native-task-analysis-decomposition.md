# Native task-analysis decomposition

## Status

Completed. `tasks.go` is below the standard Go architecture limit, and its legacy ceiling has been
removed.

## Ownership

`task_dependency_analysis.go` owns dependency records, reactive reference discovery, environment
effect classification, external/server-only symbol detection, and server-only module recognition.

`tasks.go` retains task collection, activation and policy formation, state-effect normalization,
and task diagnostics. The extraction reuses the existing task work walk and does not add a compiler
pass or change task placement, concurrency, or continuation behavior.

Native Go tests and the semantic compiler corpus protect this boundary.
