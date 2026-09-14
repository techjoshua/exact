# Preferred yield scheduler browser validation

All 56 controlled-service browser checks passed, 14 each for Node string, Node stream, Bun string and Bun stream. The current built eXact participant receives the actual rebuilt createNodeRenderScheduler through scheduleRender. React receives no scheduler. Tests cover server-rendered HTML without JavaScript, hydration, interaction behavior, focused input preservation, validation, recoverable transport failure and event-stream reconnect.

The temporary harness copies existing server harnesses and changes eXact render options to enable scheduling. Relative module locations are adjusted for the scratch directory. Bun uses its native HTTP worker with the same explicit option. Default comparison configuration remains unchanged. Two harness preparation failures (a relocated relative filesystem path and an overly broad text replacement) were corrected before the successful test runs. No framework behavior was changed to pass these tests. All owned harness processes terminated.

The Node-adapter suite passes 38 tests, covering both scheduler.yield and setImmediate fallback paths, cancellation and yield rejection. Adapter build, targeted ESLint, source-architecture, JSDoc, explicit-any ratchet (73/73) and changed-file formatting checks pass.

These are correctness checks, not browser performance measurements. They do not establish paint timing, low-rate HTTP latency or throughput of larger documents. The optimization goal remains open. The adjacent SHA-verified archive contains successful browser logs, harness generation and the source scheduler/tests.
