# Native time-lowering decomposition

## Status

In progress. Time diagnostics now have a separate owner while the lowering traversal and plan
construction remain unchanged. The `time_lowering.go` legacy ceiling has ratcheted from 1,734 to
1,530 checker-counted lines.

## Ownership

`time_diagnostics.go` owns authored precision, clock-source, unsafe-expression, and automatic
accuracy diagnostics. It may inspect formatter and clock plans, but it does not emit runtime AST or
own activation lifecycle.

`time_lowering.go` continues to own activation construction, change-plan inference, quantization,
clock-read rewriting, and derived-reference lowering. Further extraction should separate pure plan
inference from AST emission without adding another traversal or changing clock ownership.

Every split must pass native Go tests and the semantic compiler corpus. The legacy ceiling should
be removed once all remaining files are below the standard 1,200-line Go limit.
