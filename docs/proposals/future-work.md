# Candidate future work

Status: exploratory. These are not release commitments or current framework
behavior.

Current capabilities and limits are indexed in [`../README.md`](../README.md).
A substantial design may move into its own proposal when its audience, unresolved decisions, and
scope warrant one. Ordinary fixes and implementation details do not require standalone proposals.

## Invocation-scoped task progress

Plan replaceable progress snapshots from a pending server task to a compiler-declared client task,
scoped to the browser-initiated invocation. An explicit task policy (provisionally
`TaskContext.client().progress()`) would identify receivers. The compiler would generate
receiver identities, payload contracts, and server emission stubs instead of serializing callbacks.
This API does not exist yet. The server would send messages through the initiating request's
response, with the ordinary return value delivered at settlement. The initial transport candidate
is the existing Fetch/NDJSON stream, not SSE's `text/event-stream` format. Both require incremental
HTTP response delivery; documentation must identify the actual transport and deployment limits.

Agreed compatibility requirement: warn and disable live progress delivery when the selected
adapter or deployment configuration cannot support it. The generic serverless adapter currently
buffers responses and must select that fallback. An unavailable capability must not make an
otherwise valid server invocation fail: run the server task once and return its ordinary result or
error through the existing buffered path. Do not queue disabled progress snapshots for replay at the
end, silently restart work, or introduce polling. Receivers are optional observations; correctness,
required state transitions, and business side effects must not depend on their execution. The
compiler should reject use of their return values as cross-environment results.

The progress fallback must preserve the originating task's placement, priority, readiness,
concurrency, and lifetime policies. In particular, `server().deferred()` still runs at deferred
priority and returns its ordinary result or error; only live progress delivery is disabled.
`deferred()` does not imply streaming, nonblocking readiness, or durable background execution.
Test the unsupported fallback with deferred tasks as well as normal-priority tasks. This policy
must not be confused with buffering progressive SSR, where the shell and later rendered content
can reach the browser together despite the server having produced them incrementally.

Emit an actionable, deduplicated warning identifying the unsupported adapter or configured limit
and the selected fallback. Identify each affected component and its progress receiver task, with the
originating server task and source location when available. For packaged components, include the
owning package and available component/export names; absent source metadata must not suppress the
warning. Use compiler-owned identity for correlation and deduplication, with readable names for
developers rather than requiring them to interpret opaque protocol identifiers. Deduplication must
not hide additional affected components, including ones discovered through lazy loading. Keep full
source paths in developer/build diagnostics rather than exposing them to production browsers.

For example, a developer diagnostic could say: "Live task progress updates are disabled by the generic
serverless adapter, which buffers responses. Affected: AuditWorkspace, judgeOnServer → showProgress
(src/components/AuditWorkspace.tsx:42). The server task still runs and returns its final result;
progress handlers will not run."

Keep capability selection and fallback semantics in shared server/adapter support, with host-specific
capability declarations in adapters. A streaming-capable adapter does
not prove that a reverse proxy, compression middleware, gateway, or CDN forwards chunks promptly.
Document an explicit deployment opt-out and provide a scripted end-to-end probe; do not claim that
upstream buffering can always be detected automatically or that a runtime can retract snapshots
already delivered before a connection failure.

Progress is inherently missable. Each report must be a snapshot that stands on its own, such as
`{ phase: "judging", completed: 42, total: 100 }`, rather than an increment or a required event.
A browser may receive some snapshots or none. General-purpose notifications, durable delivery,
acknowledgements, and replay are outside this feature's scope.

Keep at most one pending unsent snapshot per receiver per originating invocation. New reports
replace that snapshot; separate receivers and invocations must not overwrite one another. Respect
transport backpressure instead of moving an unbounded queue into the response buffer. Already sent
bytes cannot be retracted. Coalesce pending client snapshots too, and validate payload sizes so a
single snapshot cannot defeat the memory bound. Reporting progress does not wait for browser
execution or acknowledgement.

Progress generations must be fenced against supersession and owner disposal. Each accepted
receiver activation publishes its own client state without publishing the server's staged writes.
Terminal settlement takes precedence over pending progress: discard pending snapshots and prevent
late receiver publication from overwriting completed state. Already published observations are not
rolled back when the originating task fails; the ordinary task status and result remain authoritative.
Receiver errors must be observable through client task diagnostics without changing the server's
ordinary result. Define their exact task ownership and error routing before implementation.

The recommended initial receiver contract is synchronous state updates. Finalize compiler checks
for this restriction, including indirectly asynchronous work, before implementation. Async receiver
scheduling is not required for this first version. Live progress targets browser-initiated
continuations; define the diagnostic and no-delivery behavior for SSR execution without a browser
receiver. Do not retain SSR progress for hydration replay.

Rejoining shared application work after a reload remains a fresh browser-initiated operation, not
an automatic replay of a potentially billable task. The application owns the underlying shared job
and can report its current snapshot when a reader rejoins. A broken stream must not automatically
restart the originating server work.

Acceptance must cover supported incremental delivery and unsupported fallback, including exactly
one server execution, no disabled receiver calls, final result/error preservation, and warning
deduplication without losing component attribution. Cover multiple components, packaged receivers,
and newly discovered lazy components. Verify replacement of unsent snapshots under backpressure,
bounded client buffering, isolation between concurrent invocations, terminal ordering, receiver
errors, cancellation, supersession, disposal, and disconnect cleanup. Check that progress publication
does not release staged server writes, and that final state cannot be overwritten by late progress.
Use repository-owned fixtures rather than requiring another application's checkout. Execute
equivalent adapter/runtime paths and verify early delivery through the real HTTP stack. Current Deno and Workers native-integration coverage gaps must remain visible in the
support matrix rather than being counted as passing deployment evidence. See the maintained
[streaming deployment requirements](../ssr-hydration.md#streaming-deployment-requirements).

## Progressive native forms and file transport

Task-owned forms currently coordinate validation, pending UI, optimism, server invocation, and
router work. Investigate a compiler-generated, no-JavaScript submission contract only after the
transport can preserve the same allowlisting, context, cancellation, validation, redirect, and
settlement guarantees as the hydrated path.

File uploads need a separate streaming policy covering size limits, content validation, temporary
storage ownership, cleanup, cancellation, replay protection, and deployment-specific storage.
Do not encode those concerns as ordinary serialized task arguments or imply progressive behavior
that the generated server artifact cannot actually provide.

## Registry scope beyond finite local graphs

Native component registries intentionally describe a finite, immutable set of compiler-visible
components. The implemented [dynamic component boundary](../component-registries.md)
owns intentionally opaque local, lazy, and authorized client-only remote component
selection, including its warning annotation, server-call prohibition, generation fencing, and
cleanup. Possible later registry-specific work remains limited to preload heuristics or explicitly
measured inactive-instance caching; it must not weaken registry identity or SSR guarantees.

## Not planned: persisted partial-prerender resumption

Do not implement cross-request serialization and reconstruction of postponed SSR work without new,
production-scale evidence. Static Suspense fallbacks and the existing progressive renderer already
provide immediate shells, concurrent dynamic regions, cancellation, and same-response publication.
Persisting the shell would usually save only its already-small render cost while requiring encrypted
checkpoints, replay coordination, retained builds, context reacquisition, and a second reconstructed
lifetime. Reconsider only if a future contributor demonstrates a representative workload where
that measured gain materially exceeds the simpler current path.

## Optional visual and simulation adapters

Motion, gestures, physics, and gravity compose today through ordinary state, callbacks, contexts,
task ownership, and the physics force seam. Consider convenience adapters only where repeated
application code demonstrates a stable cross-package contract. Keep each base package independently
usable and avoid introducing a required dependency cycle.

The focused
[`exploratory-motion-values-and-orchestration.md`](exploratory-motion-values-and-orchestration.md)
proposal now owns investigation of finite spring timing, interpolation helpers, reactive motion
values, gesture handoff, timelines, shared elements, and scroll/view motion. In particular, it does
not select a general component-resource API merely for motion ergonomics.

Related experiments may evaluate shared-layout coordination across independently updated roots and
worker-oriented physics helpers. They must preserve renderer-owned DOM identity, deterministic
simulation, generation fencing, cancellation, and bounded inspection.

## Reactive secret rotation

Secrets are currently compiler-qualified server values resolved through
runtime providers. Investigate whether a provider may expose a reactive secret
version so rotation invalidates only affected server work.

The experiment must prove behavior across independently compiled provider,
library, and application packages. Rotation must not permit secret values or
derived confidential data to enter client artifacts, hydration, patches,
logs, diagnostics, profiling, or public source maps.

Open questions include whether the reactive value represents availability,
value, version, or a combination; how in-flight work is cancelled; and which
contract survives package publication.

## Direct-child participation

Immediate-child composition is implemented. No additional participation capability, public child
graph, receipt-to-instance lookup, or target-export registry is selected. Intl does not depend on
such a feature. Before designing one, demonstrate two independent consumers that cannot use
composition, explicit identities, props, context, and registration.

Any candidate must distinguish authored order from stable identity, define capability delivery and
cleanup before/after preparation, and cover keyed replacement, lazy readiness, Activity, portals,
SSR, hydration, request isolation, and stale generations. Keep component boundaries opaque and
avoid private receipt mutation or compiler execution of package callbacks. DevTools projections
must expose neither private values nor protocol authority. Validate cost against existing context
and registration, not only a synthetic traversal benchmark.

The shipping application's compiled-document-shell migration remains a separate integration
candidate: account for development HTML transforms, request assets and hydration configuration,
root containers, HEAD cancellation, and stream completion before replacing its template split.

## Structural refresh optimizations

The framework already owns partition identity, refresh authority, render-program slots, and
generation fencing. Do not invent a second structural plan. Investigate any narrower optimization
only after demonstrating repeated whole-boundary serialization in a representative workload.
Preserve keyed identity, cancellation, context and secret boundaries, and server/client validation.
Measure bytes, latency, allocation, and invalidation complexity against the existing path.
The earlier compiler-composed SSR-block experiment was not adopted; its contradictory performance
evidence does not establish a pending implementation commitment.

## Enhancement performance acceptance

Independent enhancement targeting is implemented for ABI epoch 2. Keep its current contract in the
[component language](../component-language.md#bounded-target-routing), not a completed proposal.
Broader performance acceptance remains open: bundle growth, a valid paired Intl comparison, and
paired browser measurements must be assessed together. Fixed fixture failures and later profiling
do not retroactively supply missing historical measurements. The
[September findings](../findings/2026-09-performance.md#enhancement-and-intl-results-have-bounded-scope)
preserve that distinction. Implementation completion does not authorize publication.

## Shared tooling snapshots

A common host-independent compiler snapshot abstraction remains optional. Existing integrations
own stable, invalidatable engines for their sessions. Reconsider consolidation only after concrete
configuration drift or a correctness failure demonstrates a need; preserve host-specific I/O and
lifecycle ownership.
