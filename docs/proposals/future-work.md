# Candidate future work

Status: exploratory. These are not release commitments or current framework
behavior.

Current capabilities and limits are indexed in [`../README.md`](../README.md).
A substantial design may move into its own proposal when its audience, unresolved decisions, and
scope warrant one. Ordinary fixes and implementation details do not require standalone proposals.

## Compiler precision after the bounded core

The [architecture completion plan](../compiler-architecture-completion-plan.md#fact-scope-and-bounded-core-acceptance)
owns the bounded core and its required safety and finite-compilation acceptance. After that
boundary, consider exact callee/output identity, strong replacement, finer caller discrimination
and unreachable MAY setter-write pruning only where an identified consumer benefits from the
additional proof. Conservative alternatives may remain when the existing artifact and boundary
rules permit them. Analysis stalls and missing known effects or independent uncertainty are not
precision candidates to defer here.

One pruning witness remains planned and unexecuted: compare an inner captured setter containing
`if (false) selected = next` with a paired reachable assignment. The former may currently retain an
unreachable MAY write. Investigate removing that overapproximation without changing the latter's
possible write or promoting either caller's result into a declaration-wide library fact.

Source-only Await effect migration may follow existing normal analysis when a supported core
consumer does not require decoupling. Its source property projection and direct resolve/reject
role draft remain unqualified. Reconsider them against a concrete consumer, preserving known
assimilation effects, independent uncertainty and the distinction between an async Call's Promise
object and its payload. Exact settlement and broader alias/capture discrimination are optional
precision only where a conservative result already satisfies the required consumer.

Closed application callers may provide conditional inputs for their own uses. Open libraries
must retain relative dependencies for unknown callers. Neither setting permits an observed
caller to certify unconditional exported purity, target safety, identity, NoWrites or completion.

## Compiled component compatibility

The [compiled ABI evolution proposal](compiled-abi-evolution.md) owns the design for retaining
epoch-2 and later contracts through focused static entry points, sharing compatible implementations,
and reporting the components responsible for retained older ABI code. Epoch 1 remains unsupported.
Mixed-epoch execution and build attribution are proposed capabilities, not current guarantees.

## Microfrontend provider retention

Remote state and page observers currently share framework import keys through an eager host
bootstrap. Publishing whole module namespaces retains every export of each required provider.
Investigate selective publication or host-owned lazy provider chunks while preserving synchronous
import behavior, one dependency graph, bootstrap order, and older remote artifacts. A shared
compiler/provider capability catalog could also replace independently maintained import lists.
Measure initial bytes, remote activation latency, and retained graphs before choosing a design.
Any new provider acquisition contract needs explicit host minimums and mixed-version acceptance.

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

Native child helpers currently normalize nested arrays and selector groups recursively. Evaluate
stack-independent traversal against the compact current path before broadening nesting guarantees.
Preserve custom iterators, cleanup, sparse entries, getter order, and selector short circuiting.
Require ordinary flat-input CPU and allocation measurements when considering shared traversal.

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
