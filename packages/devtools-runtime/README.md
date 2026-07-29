# @exactjs/devtools-runtime

Optional browser runtime bridge for eXact DevTools.

`installExactDevtoolsRuntime()` joins the renderer’s production inspection host, compact
compiler-emitted source slots, and authorized server cooperation behind
`Symbol.for('@exactjs/devtools-hook')`. The hook exposes versioned read-only queries and bounded
subscriptions; it never exposes component instances or callbacks.

Only import this package in builds whose debug runtime instrumentation is enabled. Hardened builds
must omit the import and compile with both `emitInspection: false` and
`instrumentInspection: false`.
