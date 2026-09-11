# Selected task readiness foundation for SSR output spans

Date: 2026-09-09. Implemented internal capability; compiler/span integration remains unfinished.

## Change

Compiler-guided output spans need to wait for task identities that can affect them, without waiting
for unrelated task activations. ServerTaskReadiness now supports selected pending-work queries and
request-local completion-change tokens. ServerComponentExecutionFrame exposes these through
blockingWork(selection) and blockingVersionFor(selection). Transition identities remain opaque.

Frames enable identity tracking explicitly with trackTaskIdentities. Existing SSR callers do not
enable it yet, so ordinary frames retain a pending-task Set without identity-lookup allocation.
Selected queries on an untracked frame fail explicitly. Revision tracking is also lazy: a selected
revision is a change token for a stable selection within one request, not an absolute task count.

The task system still starts and owns work. Selection only observes already-issued blocking work
and existing publication dependencies; it does not promote ordinary nonblocking tasks. Empty or
settled selections return undefined rather than creating a promise. Failed selected tasks retain
their failure. Unidentified work participates conservatively in every selection. Pending queries
cover current activations; consumers recheck after settlement to discover later activations.
Unrelated completions do not change a selected revision. Request disposal still cancels and cleans
up all owned work, including work outside the selected set.

The server execution types moved to server-component-execution-contracts.ts to preserve the source
architecture limit. Existing exports still expose the same contracts with the additive methods and
option. No emitted artifact or wire format changed, and frozen ABI fixtures passed without regeneration.
Engineering documentation describes the capability and explicitly states that SSR still uses
whole-component readiness. No application-facing streaming behavior or documentation claim changed.

## Avoiding unused tracking overhead

The first implementation replaced the pending Set with a Map. A focused microbenchmark found a
large Bun cost, so that implementation was replaced before acceptance. The final implementation
keeps the Set and adds a WeakMap only when the compiler-driven capability is enabled.

Each implementation was compared with the prior marker-hex artifact in sixteen fresh processes:
Node/Bun, three/sixteen immediately resolving tasks per frame, and two reversed-order pairs. Each
population warms 4,000 frames and measures 30,000. The check creates a readiness tracker, observes
the tasks, waits for all of them, verifies completion/version, and confirms no further wait is needed.
Both populations exercise the existing wait-for-all path. This is not an SSR or HTTP benchmark,
does not measure task bodies, and does not measure the new selected-query path's performance.

Microseconds per frame, control / candidate; lower is better:

| Implementation | Runtime | Tasks | Pair 1 | Pair 2 |
| --- | --- | ---: | ---: | ---: |
| map | node | 3 | 0.524 / 0.558 | 0.512 / 0.552 |
| map | node | 16 | 1.879 / 1.909 | 1.861 / 1.946 |
| map | bun | 3 | 0.612 / 0.966 | 0.631 / 0.917 |
| map | bun | 16 | 2.090 / 3.380 | 1.976 / 3.198 |
| opt-in | node | 3 | 0.558 / 0.573 | 0.522 / 0.545 |
| opt-in | node | 16 | 1.893 / 1.903 | 1.847 / 1.908 |
| opt-in | bun | 3 | 0.635 / 0.653 | 0.648 / 0.664 |
| opt-in | bun | 16 | 2.004 / 2.110 | 2.129 / 2.144 |

The opt-in design removes most of the measured regression. It retains a small positive overhead
in these short local observations; no zero-cost claim is made. This is an enabling capability for
the requested compiler/span architecture, not a throughput optimization by itself. Overall React
parity remains unmet, and earlier React comparisons must not be relabeled as measurements of this build.

## Validation

- Core: 258 tests across 50 files. SSR: 284 tests across 45 files.
- Focused readiness/frame coverage includes selected and unrelated pending work, revisions,
  repeated activations, retained failures, unidentified work, opt-in enforcement, and cancellation
  of a selected wait during request disposal. Existing lifecycle checks retain once-only cleanup.
- Core build and exact compilation, comparison client/Node/Bun builds, test type checking, lint,
  source architecture, platform boundaries, compiled ABI, initial release epoch, and package-content
  checks pass. The package-content check used npm exec's cached/downloaded Node 26.8.2; timed
  populations used the explicitly selected Node 26.8.1 and Bun 1.4.2 executables.
- Forty-eight complete documents across Node/Bun, string/stream, small/large, control/current match
  their paired full-body hashes. These are output checks, not new timing populations.
- Client asset hash remains index-CdIXDKwS.js. No browser suite was rerun for this internal task query
  capability; SSR/hydration ABI tests and package suites provide the current boundary validation.

The archived validation summary records completed commands, not raw transcripts. Raw timing
observations, frozen implementations, output observations, relevant source/tests, and hashes are
preserved separately in the evidence archive. The current frozen implementation is
task-selection-opt-in-current.mjs, verified byte-for-byte against the built Node participant.
task-selection-current.mjs in the archive is the rejected initial Map implementation, retained
under its original experiment identifier so its raw observations remain traceable.

## Remaining work

The compiler must derive transitive task dependencies for ordered SSR spans and defer reads of
affected values until those dependencies settle. The shared renderer must consume those spans,
flush a proven unaffected head before pending body work, preserve capture/rollback boundaries,
and let each sink own staging/backpressure. This capability is the readiness primitive for that
integration; it does not yet deliver early head bytes or improve the React comparison.
