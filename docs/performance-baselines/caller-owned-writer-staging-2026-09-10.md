# Caller-owned writer integration staging, 2026-09-10

The source now contains `renderProgramWriter`, an internal ownership layer for the native
compiler's continuation-writer migration. It gives a writer one output object with a sink,
recursive rendering callback, and prepared-sibling lifetime. Local capture uses the same sink
interface and preserves enhancement prefix routing. Shared sinks remain owned by the request.

This layer is staged, not selected by public rendering. A source search confirms its current
callers are the focused tests only. No performance gain is claimed and no new benchmark was run.
The current production path still uses the three-argument compiler writer and segment arrays.

Validation completed:

- Seven focused cases cover shared/local output, prepared-sibling disposal after success, throw,
  rejection, and invalid output; document ancestry during head backpressure; and enhancement prefixes.
- All 327 SSR tests passed.
- Package build, repository test typecheck, focused ESLint, source architecture, platform boundaries,
  and package contents passed. The initial test typecheck required an explicit generic argument in
  the test callback; the corrected check passed.

Remaining migration work is coupled: update `ExactRenderProgramSsrOutput` and operations/writer
types in core, implement direct operation publication, select the native continuation emitter,
and migrate both `renderDirectSsrContent` and `SsrOperationTarget.renderPreparedServerProgram`.
Remove the old array-returning handoff when callers move. Preserve scheduled sibling startup and
cleanup without collecting the complete segment array. Review validation-before-publication and
document-host entry ordering when binding the generated preparation prefix to the new owner.
The staged wrapper's tests are not proof of those compiler integration guarantees.

Before selecting the new path, validate compiled programs with pending children, sink pressure,
scheduled retries, local captures, hydration, cancellation, and malformed slots. Migrate repository
fixtures and initial-release ABI documentation together. Then compare current source builds against
the saved production control and React on both runtimes and output modes. Overall React parity and
progressive public tree-to-transport integration remain unfinished.
