# SSR completion scope

Status: complete. Implementation, full benchmark publication, documentation, and final validation are ready for the initial release commit.
This is the fixed completion list approved on September 11, 2026.
Do not add optimization tracks to this work.

1. Separate an enclosing server document shell from the requested application hydration root.
   Preserve explicitly reactive authored-document hydration. Cover root identity, props,
   resumption, context ownership, cancellation, and browser adoption together.
2. Resolve compiler-directed head collection through SSR context. Preserve document ordering and
   resource discovery without an application-owned tree search.
3. Connect compiler-proven task dependencies to output spans. Pending tasks must block affected
   reads; completed tasks must not introduce unnecessary suspension. Preserve task-system ownership.
4. Complete incremental document body delivery through the shared rendering engine and a bounded,
   configurable sink. Flush the head and before pending work, retain hydration before closing tags,
   and release buffers and descendant ownership on failure or cancellation.
5. Close the structural-composition experiment with an explicit acceptance or rejection decision
   grounded in semantic coverage and the existing contradictory performance evidence.
6. Complete automatic Node adapter scheduling. The adaptive controller must be enabled by default
   and decide when yielding helps, rather than delegate that decision to application authors.
   Validate sparse traffic, changing load, large documents, and client response tails. Bun policy
   is independent. Retain explicit decisions for rejected per-turn work-bound experiments.
7. Reconcile engineering and public documentation with the resulting behavior, verify the final
   Node/Bun string/stream and browser results, complete relevant release checks, and commit the work.

The initial release remains 0.5.0, ABI epoch 1. Approved unreleased contract redesigns replace
version one in place, without obsolete compatibility implementations. Frozen fixtures remain
unchanged. Performance measurements must distinguish final source builds from diagnostic artifacts,
retain full authored application/shell rendering, and leave React unchanged.

## Current evidence

- The structural ancestry projector replaces version one. Native compiler tests, 386 SSR tests,
  compiled-artifact checks, and release ABI checks passed after the reset.
- `documentShell` now separates the requested application from its enclosing ordinary document
  component. All 412 SSR tests and 56 Node/Bun string/stream browser checks pass. Reusing the direct
  document entry then passes 49 focused SSR checks and 28 string browser checks with identical HTML.
- The document sink now releases incremental body output with an 8192-byte default threshold and
  four thresholds of bounded transport read-ahead. Fresh 2048-byte threshold experiments lost
  throughput on both runtimes, so the configurable 8192-byte default remains.
- Direct authored document views now carry a compiler proof that prevents a discarded read of
  pending task state during progressive HTML discovery. Native compiler tests and 413 SSR tests
  pass. A subsequent conservative output-region proof now streams static heads before their own
  blocking tasks, deferring intrinsic body state reads through the existing task owner. Calls,
  child components, dynamic attributes, enhancements, and nonblocking tasks retain atomic views.
  All 416 SSR tests passed before the final module extraction. Chromium discovered CSS at 10.4 ms
  while the diagnostic task settled at 255.2 ms. Final package and browser validation passed.
- Structural composition remains rejected. Node request handlers now enable adaptive admission
  by default, retaining trials only when completion capacity and lag beat both surrounding immediate
  controls. Changing workloads and idle recovery were exercised in one running host. Native Bun
  retains immediate admission. The final Node adapter passes 57 focused tests.
- All 112 current Node/Bun string/stream browser checks pass. Final HTTP captures are complete.
  The completed client replay, startup, heap, and internal framework measurements are retained with
  their artifact identities. Earlier temporary version-two captures remain historical.
- Final validation passed 2,102 package tests (11 skipped), 88 benchmark-harness tests, test and docs
  type checks, 10 docs tests, and desktop/mobile verification of the published tables. See the
  [completion baseline](performance-baselines/ssr-completion-2026-09-11.md) for all modes, tails,
  request errors, telemetry retries, and artifact identities.

The [shell and body checks](performance-baselines/ssr-shell-body-2026-09-11.md) rerun prior artifacts
and React under the user's changed PC workload. They retain repeats and tails rather than compare
against historical absolute timings. Incremental body delivery trades throughput against the prior
collector for bounded memory and earlier output; the configurable 8192-byte policy is accepted.
The direct shell entry improves both Bun string
repeats and one Node repeat. These focused measurements are not the final full benchmark baseline.

See [SSR and hydration](ssr-hydration.md), the
[application hydration experiment](performance-baselines/application-hydration-2026-09-10.md),
and the [structural composition proposal](proposals/ssr-structural-composition.md).

## Closed experiment decisions

Item 2 is resolved by retaining compiler-directed document programs rather than introducing a
second head collection. `canonicalProgramDocument` already proves direct head/body ordering and
emits document host metadata. The shared program writer follows those children and flushes the
completed head. Runtime normalization inspects immediate document children only when needed;
it does not crawl the application tree looking for head content. A context collection would add
registration and ownership work without removing the suspected traversal. Arbitrary body
descendants also cannot insert content into a head already delivered to the browser. Existing
resource-discovery and document-ordering rules remain in force.

Item 5 is closed for this prerelease without adopting its prototype.

Structural composition reduced traversal counts, but the
[profiler-toggle comparison](performance-baselines/structural-profiler-toggle-2026-09-10.md)
contradicted the earlier throughput improvement. The
[identical-replica warmup check](performance-baselines/structural-immediate-warmup-2026-09-10.md)
showed a 16.4% spread between replica means without an implementation difference. The prototype
also lacks the general capture-order, task, cancellation, and browser contract coverage required
for a compiler integration. Keep the existing generated writer and its proven static composition.
The speculative structural-block redesign is not part of the initial release.

Item 6 accepts [automatic Node admission](performance-baselines/adaptive-default-node-2026-09-11.md).
The first lag-only gate and a handler-duration comparison were rejected as default policies.
The accepted controller compares completion capacity and event-loop delay against immediate controls
on both sides of a trial, backs off unsuccessful trials, and rechecks changing workloads. Server
handler duration cannot stand in for client latency because it excludes waiting before Node invokes
the handler. Client tails remain explicit validation evidence, not a universal guarantee.

The earlier evidence remains relevant to keeping the scheduling decision runtime-specific:
The [adaptive Node trial](performance-baselines/adaptive-scheduling-node-tails-2026-09-11.md)
improved throughput, but did not establish a controller that continuously adapts to changing load.
The [Bun trial](performance-baselines/adaptive-scheduling-bun-tails-2026-09-11.md)
lost throughput and worsened response tails. Lag alone does not justify an automatic policy.
Single-pending-callback trials traded throughput and queue wait against some tail improvements;
the [queue trace](performance-baselines/scheduler-queue-wait-trace-2026-09-11.md) separates that wait
from renderer CPU. Do not introduce a strict per-turn admission bound.
The existing batch size bounds starts per callback, not total rendering work in an event-loop turn.

These are acceptance decisions from completed experiments, not missing implementation promises.
Final HTTP publication, documentation reconciliation, and commits complete the remaining work.
