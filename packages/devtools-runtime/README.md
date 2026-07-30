# @exactjs/devtools-runtime

Optional browser runtime bridge for eXact DevTools.

`installExactDevtoolsRuntime()` joins the renderer’s production inspection host, compact
compiler-emitted source slots, and authorized server cooperation behind
`Symbol.for('@exactjs/devtools-hook')`. The hook exposes versioned read-only queries and bounded
subscriptions; it never exposes component instances or callbacks.

Runtime snapshots and queries expose one task tree. Initialization, reactive,
interaction, invoked, and lifecycle work are distinguished by activation
metadata rather than separate task and action collections. Framework-created
frames preserve a stable semantic kind separately from their optional
human-facing name.

Only import this package in builds whose debug runtime instrumentation is enabled. Hardened builds
must omit the import and compile with both `emitInspection: false` and
`instrumentInspection: false`.
