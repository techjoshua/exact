# Serializable partial-prerender resumption

## Status

Implementation-ready after the implemented
[`recursive-server-client-graph-partitioning.md`](../history/recursive-server-client-graph-partitioning.md),
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md),
[`server-component-library-trust.md`](../history/server-component-library-trust.md),
[`enhancement-first-internationalization.md`](../history/enhancement-first-internationalization.md),
[`component-value-callback-bindings.md`](../history/component-value-callback-bindings.md),
[`compiler-owned-render-programs.md`](../history/compiler-owned-render-programs.md),
[`bounded-deterministic-async-ssr.md`](../history/bounded-deterministic-async-ssr.md),
[`compact-hydration-publication.md`](../history/compact-hydration-publication.md),
[`compiler-planned-component-execution.md`](../history/compiler-planned-component-execution.md), and
[`lazy-interaction-islands.md`](../history/lazy-interaction-islands.md). Resumption must
persist the settled activator-selected enhancement ownership, bundler authorization fingerprint,
and bounded root-bearing-frame authority rather than reconstruct trust or the current unrestricted
target search. It must also retain opaque locale, catalog, formatter-data, and message-plan
identities without treating translated strings as durable operations. Current
progressive SSR can emit a fallback shell and reveal settled Suspense ranges during one render. It
does not serialize postponed renderer/task ownership and continue it in a later request.

The current range, nested-element, and authoritative boundary replacement contracts are sufficient
for correct resumed publication. The deferred
[`structural render-program extensions`](compiler-planned-structural-refresh.md) may reduce resumed
CPU or patch size when measurements justify them, but are not a prerequisite.

The measurement baseline and dependent-foundation experiments 2–4 and 6 in
[`javascript-performance-improvements.md`](../history/javascript-performance-improvements.md) must have
recorded dispositions before implementation; those dispositions now exist. Resumption uses the
focused render-program, deterministic async SSR, compact hydration, progressive publication, and
fused transport contracts above and retains each bounded generic fallback rather than recreating a
parallel representation.

| Delivery area          | Current state                             | Proposed state                                         |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------ |
| Progressive SSR        | One live render/stream lifetime           | Persist HTML plus an opaque postponed artifact         |
| Later request          | Starts a new render                       | Reconstructs authorized postponed boundaries and tasks |
| Context                | Live request/application context          | Reacquired by compiler-known public context name       |
| Continuations          | Attached component transitions            | Reacquired from the retained build and root blueprint  |
| Structural publication | Progressive range reveal or root fallback | Existing partition-authorized range/boundary patches   |

## Decision

Add partial prerendering as persistence around the existing attached component contracts,
root-keyed execution blueprints, partition ownership, Suspense, and refresh models. Do not create a
second component execution model, serialize the request-local execution graph, or serialize
JavaScript runtime objects.

The lifecycle is:

```text
prerender
  → render currently available work
  → serialize postponed framework state
  → store HTML and opaque artifact
later request
  → authenticate and validate artifact
  → reacquire request/application contexts
  → resume only postponed work
  → publish authorized structural results
```

## Goals

- Persist a safe checkpoint after currently available prerender work settles.
- Resume only postponed boundaries and task generations in a later request.
- Reuse opaque compiler continuation identities and structured task ownership.
- Reconstruct renderer ownership without serializing component instances, VNodes, or promises.
- Reconstruct active enhancement components through the same ordinary component contracts as every
  other postponed owner, including activator grouping, shared props, and bounded target authority.
- Reacquire server contexts by declared name and residency policy, never serialized value.
- Fail deterministically for stale builds, retired operations, invalid signatures, or unavailable
  contexts.

## Non-goals

- Serializing arbitrary closures, stacks, promises, DOM, VNodes, or component instances.
- Persisting secret values or confidential derived data.
- Making bundler chunk paths or module filenames public protocol identity.
- Resuming across incompatible builds through best-effort migration.
- Keeping a server process, request, socket, or in-memory renderer alive between phases.
- Replacing normal streaming SSR when one request can complete the work.

## Authoring surface

`@exactjs/ssr/prerender` owns the ratified `prerender()` and `resumePrerender()` APIs. The focused
server-only subpath keeps checkpoint codecs and cryptography out of ordinary SSR consumers. The
artifact remains opaque:

```ts
const result = await prerender(<Page />, {
	contexts,
	identity: { applicationId, buildKey, executionRoot },
	protection,
	signal
});

result.html;
result.postponed;

if (result.postponed !== null) {
	const response = await resumePrerender(result, {
		request,
		contexts,
		identity: { applicationId, buildKey, executionRoot },
		protection,
		replayStore,
		signal
	});
}
```

The public `ExactPrerenderResult` is a readonly discriminated union of `{ html, postponed: null }`
and `{ html, postponed: ExactPostponedArtifact }`. The artifact is an authenticated-encrypted,
branded string suitable for application-selected storage. `resumePrerender()` accepts only the
non-null member so it can verify the stored HTML digest before emitting that prelude, then returns
the existing adapter-neutral
`ExactResponseLike` with progressive resumed output. Patch-only client resumption is not part of
the initial API.

`ExactPrerenderProtection` is a public sealing/opening interface. The subpath supplies
`createPrerenderKeyringProtection()` using Web Crypto AES-256-GCM with an active key identifier and
retained read keys for rotation. Applications may supply an equivalent implementation, but
plaintext and authentication-only artifacts are rejected. Both phases require the same
application/build/root identity rather than deriving authority from the artifact.

`ExactPrerenderReplayStore` exposes one atomic `consume(artifactId, expiresAt, signal)` operation.
It is required for every non-null resume and must return false for an already consumed artifact.
The framework supplies an explicitly development-only bounded in-memory implementation; production
adapters require application-owned durable or distributed storage. All artifacts are single-use in
this delivery. A future compiler proof may introduce a separate replay-safe format, but resume must
not infer read-only safety from runtime observations.

## Artifact contents

The artifact may contain only validated framework-owned data:

- artifact schema and compiler/runtime protocol versions;
- build and execution-root identity;
- resolved root locale, per-message-owner source locales, catalog fingerprint, Unicode
  formatter/conversion-data version, and application unit-policy identity;
- partition, boundary, range, and generation identities;
- opaque continuation and operation identities;
- authorized serialized dependency and capture slots;
- available dependency/output slot values and versions required by postponed work;
- opaque identities for pending transitions plus their ownership, priority, and generation facts;
- Suspense and Activity ownership needed to reconstruct postponed ranges;
- active enhancement component contracts, activator-selected canonical groups, target or direct `_`
  boundary generations, first-root-path and root-bearing-frame authority where applicable, context
  ordering, and postponed task relationships, represented by opaque framework identities rather
  than serialized instances;
- required public context snapshots when their declaration permits serialization; and
- names and residency requirements for server contexts that must be reacquired.

The artifact does not copy the root execution blueprint or flatten the request graph. The retained
build and execution-root identity reacquire the immutable blueprint at resume time. Serialized slot
and transition indexes are meaningful only after validation against that exact attached component
contract.

It must not contain:

- arbitrary functions, closures, stacks, promises, component instances, VNodes, or DOM objects;
- secret values, secret-derived confidential data, provider instances, or request objects;
- debug source excerpts or inspection catalogs;
- raw server-context values when the context is reacquired by name; or
- bundler-specific paths as durable operation identity.

Component value/callback shorthand adds no serializable function. A checkpoint may retain only the
same authorized parent state slot, component-prop dependency, and opaque continuation identity as
the explicit value-plus-callback expansion. The exact retained build reconstructs any generated
callback and intrinsic adapter; the artifact never stores callback source, prop names as operation
identity, or a mutable binding object.

Enhancement components receive no special resumption shortcut. An active enhancement is an ordinary
durable component in the saved ownership graph even when its rendered output is transparent. The
checkpoint records only the opaque contract and generation information required to reconstruct it;
it never serializes the instance or treats the attributed marker as the owner. Resume must restore
its activator-selected canonical component group, distributed shared props, context-derived
same-target order, task descendants, Activity state, cleanup obligations, and either its
root-bearing frame, root generation, and target binding or its direct `_` boundary and generation
before resumed work can publish. It must validate the saved active conditional/Suspense selection,
cannot search through an opaque nested component frame to recover a missing target, and cannot
invent an intrinsic target for a direct `_` declaration. If its enhancement catalog entry is
unavailable or unauthorized in the retained build, the optional enhancement stays inactive and the
saved generation cannot be partially reconstructed.

## Authentication, storage, and expiry

Every artifact is authenticated-encrypted and bound as associated data to its schema, application,
build, execution root, issued-at time, expiry, key identifier, stored-HTML digest, and optional
deployment generation. Opening, identity comparison, expiry validation, HTML-digest validation,
and atomic replay consumption all occur before operation lookup, context acquisition, response
headers, or prelude bytes. A failure throws a typed prerender validation error so the application
may perform an ordinary full render without having partially committed stale output.

The application owns storage location, retention, routing, and deployment rollout. The framework
owns schema validation, cryptographic interface, resource limits, replay protocol, and disposal of
framework-side scratch state. The application stores the opaque artifact with its HTML record; the
framework does not introduce an application-global checkpoint store or an indirect token service.

Defaults are a five-minute lifetime, 1 MiB encoded artifact, 1,024 postponed partitions, depth 100,
and 100,000 decoded records. Configurable limits may only narrow or raise these within documented
hard maxima; the encoded artifact hard maximum is 16 MiB and expiry hard maximum is 24 hours.
Decode and reconstruction budgets are checked independently of encoded size. Rejection releases
decoded buffers and never marks an artifact consumed until cryptographic, identity, digest, schema,
and resource validation have succeeded; replay consumption still occurs before any executable
contract or context is acquired.

## Resume execution

1. Validate envelope size, schema, authentication, expiry, build, and execution root.
2. Resolve only allowlisted continuation contracts from the exact retained build.
3. Reacquire named application/request contexts and verify residency and serialization policy.
4. Reacquire the retained root component and its immutable execution blueprint, then instantiate
   request-local value slots, postponed partitions, and readiness watchers only for selected work.
5. Reconstruct enhancement root-bearing frames only from saved compiler-authorized ownership and
   the currently validated branch/Suspense selection.
6. Resume generations with a new request cancellation root while preserving compiler-owned
   generation fencing.
7. Publish only patches authorized by the saved partition containment and retained boundary or
   range contracts; use the nearest authoritative replacement when a narrower patch is unavailable.
8. Settle, cancel, or fail every reconstructed frame and release all acquired resources.

The resume request cannot access completed sibling partitions merely because they shared the
original component. Context lookup failure, retired build identity, or invalid operation identity
fails the postponed range through the configured recovery contract.

`prerender()` buffers the storage prelude intentionally. Resume validates that prelude, writes it
once through the existing request chunk writer, and then writes authorized progressive patches
without repeated string joining. The Node adapter uses `ExactResponseBody.writeToNode()` directly;
a Web `ReadableStream` is constructed lazily only for consumers requesting that interface. A
boundary failure after output begins follows ordinary progressive SSR error/fallback publication;
all envelope and reconstruction failures that can be known earlier fail before output begins.

An unresolved compiler-authored dynamic component contributes only its client activation identity
and an authorized immutable preload-selection fact. Its resolver, promise, candidate, URL, and
possible implementation graph never enter the artifact, and resume never resolves it on the
server. The retained build plan reacquires any current canonical preload URL after validation.

## Package ownership and implementation boundary

- The native compiler emits checkpoint eligibility, serializable-slot schemas, partition
  containment, and reconstruction identities in attached component contracts.
- `@exactjs/ssr/prerender` owns the public APIs, opaque codec, protection/keyring helper, limits,
  reconstruction, and typed validation errors. It reuses the existing SSR renderer and plans.
- `@exactjs/server` owns request/context reacquisition, replay-store contracts, build retention,
  cancellation, and direct response-body transport.
- Node, Fetch, and serverless adapters map `ExactResponseLike` to their response lifecycle. They do
  not own artifact schema, resumption semantics, or application storage.
- Hydration and progressive publication consume the existing range/boundary patch protocol; no new
  client resumption runtime is introduced.

There are no provisional public names or unresolved security modes. Structural refresh extensions,
Webpack/Bun microfrontend parity, and dynamic component boundaries are not implementation
prerequisites. Each feature must merely preserve the opaque identities and containment rules above
when present.

## Performance and reconstructed-lifetime constraints

Partial prerendering must preserve the disposal targets in
[`javascript-performance-improvements.md`](../history/javascript-performance-improvements.md):

- checkpoint construction writes bounded serialized records and never retains a live component,
  VNode, mounted range, task frame, request context, or complete SSR owner graph after the prerender
  request ends;
- completed non-postponed siblings are disposed during traversal and do not remain reachable merely
  because one later boundary is checkpointed;
- resume reconstructs only the selected postponed partitions and their active ancestor/context
  chain, using lazy component/task ownership rather than an eager full-page shell;
- decoded checkpoint buffers, authentication inputs, catalog/plan lookups, and reconstructed scratch
  maps are released after validation or failure; and
- deployment/build retention bounds count checkpoint-referenced contract generations so stale
  builds and locale/catalog data cannot remain resident indefinitely.

Compiler-proven independent postponed siblings may resume through the same bounded deterministic
SSR concurrency contract used by an ordinary request. Checkpoint decoding should be lazy by
selected postponed partition, and resumed rendering should write directly through compiler render
plans and the request chunk writer rather than reconstruct complete VNode/HTML snapshots first.

Verification must measure prerender and resume peak heap, collection after aborted/expired/invalid
artifacts, many small postponed boundaries, and one wide postponed boundary. The acceptance target
is independent of storage size limits: a small serialized checkpoint may still be rejected if its
decoded or reconstructed working set exceeds configured budgets. Also report shell/complete latency,
resume CPU, output bytes, upstream concurrency, and requests per second so process throughput is not
traded silently for one checkpoint's latency.

## Delivery order

1. Add the focused public subpath, ratified types, limits, versioned checkpoint schema, keyring
   protection, and replay-store contract; round-trip only inert records in memory.
2. Reconstruct one postponed Suspense boundary with no external context after full preflight.
3. Reacquire named request/application contexts and protect secret/residency boundaries.
4. Resume nested partitions by restoring validated slot availability and letting attached
   component transitions recreate their ordinary request-owned task relationships.
5. Integrate atomic replay consumption and adapter-neutral direct response-body streaming.
6. Add deployment retention and stale-build recovery guidance.

## Verification

- Schema and property tests for deterministic encoding, malformed values, size limits, and version
  rejection.
- Cryptographic contract tests for key rotation, associated-data mismatch, ciphertext tampering,
  HTML substitution, expiry, and failure before response commitment.
- Security tests proving secrets, contexts, callbacks, request objects, source text, and module paths
  cannot enter artifacts.
- Integration tests that prerender, destroy all runtime state, then resume in a fresh server host.
- Cancellation, expiry, replay, stale-build, missing-context, and retired-operation tests.
- Concurrent replay tests proving exactly one process may consume an artifact and the development
  in-memory replay store is bounded and never advertised for production.
- Nested Suspense, Activity, server slot, task-ownership, range-replacement, and boundary-fallback
  tests.
- Transparent and structural enhancement tests covering activator groups, shared props,
  root-bearing frames, conditional/Suspense selection, target generations, contexts, tasks,
  Activity, catalog absence or exclusion, cancellation, and cleanup after process loss.
- Adapter tests for Node, Fetch, and at least one serverless storage/response lifecycle.

## Acceptance criteria

1. A prerender can persist HTML and a bounded opaque artifact, discard all live renderer state, and
   resume postponed work later.
2. Resume reuses existing continuation and task semantics rather than a parallel execution model.
3. Only compiler-authorized public data and framework identities enter the artifact.
4. Server contexts are reacquired by name and secret values never serialize.
5. Build, execution-root, generation, expiry, and replay checks fail closed before execution.
6. Resumed output mutates only the saved authorized ranges and retains boundary replacement as
   fallback.
7. Every acquired context, task, renderer range, and storage-side reservation has deterministic
   cleanup.
8. Active enhancement components resume through ordinary component ownership and retain their
   activator grouping, shared props, context order, task tree, bounded root-frame authority, target
   generation, Activity, and lifecycle guarantees.
9. The public record, protection, replay, limit, error, and response contracts are fully named and
   adapters require no private SSR representation.
10. Resume validates the stored HTML and all artifact authority before emitting bytes, then uses
    the existing chunk-native response path without a mandatory Web stream or second client model.
