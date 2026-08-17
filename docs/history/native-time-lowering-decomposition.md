# Native time-lowering decomposition

## Status

Completed. The original module is now below the standard Go architecture limit, and its legacy
ceiling has been removed.

## Ownership

`time_diagnostics.go` owns authored precision, clock-source, unsafe-expression, and automatic
accuracy diagnostics. It may inspect formatter and clock plans, but it does not emit runtime AST or
own activation lifecycle.

`time_activation_lowering.go` owns range-local activation construction and the small runtime plan
AST primitives consumed by inference.

`time_clock_lowering.go` owns clock-read instrumentation, zero-argument date lowering, and
clock-derived reference rewriting.

`time_lowering.go` now owns change-plan inference, formatter sensitivity, static helper tracing,
and quantization analysis. The split adds no traversal and does not change clock ownership.

Native Go tests and the semantic compiler corpus must continue to guard these ownership boundaries.
