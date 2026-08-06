# Serializable partial-prerender resumption

## Status

Proposed after
[`recursive-server-client-graph-partitioning.md`](../history/recursive-server-client-graph-partitioning.md),
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md),
[`server-component-library-trust.md`](../history/server-component-library-trust.md),
resolution or explicit rejection of
[`cooperative-structured-children.md`](cooperative-structured-children.md),
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md),
[`component-value-callback-bindings.md`](../history/component-value-callback-bindings.md),
[`compiler-owned-render-programs.md`](compiler-owned-render-programs.md),
[`bounded-deterministic-async-ssr.md`](bounded-deterministic-async-ssr.md),
[`compact-hydration-publication.md`](compact-hydration-publication.md),
[`lazy-interaction-islands.md`](lazy-interaction-islands.md), and
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md). Resumption must
persist the settled activator-selected enhancement ownership, bundler authorization fingerprint,
and bounded root-bearing-frame authority rather than reconstruct trust or the current unrestricted
target search. It must also retain opaque locale, catalog, formatter-data, and message-plan
identities without treating translated strings as durable operations. Current
progressive SSR can emit a fallback shell and reveal settled Suspense ranges during one render. It
does not serialize postponed renderer/task ownership and continue it in a later request.

The measurement baseline and dependent-foundation experiments 2–4 and 6 in
[`javascript-performance-improvements.md`](javascript-performance-improvements.md) must have
recorded dispositions before implementation; those dispositions now exist. Resumption uses the
focused render-program, deterministic async SSR, compact hydration, progressive publication, and
fused transport contracts above and retains each bounded generic fallback rather than recreating a
parallel representation.

| Delivery area          | Current state                             | Proposed state                                         |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------ |
| Progressive SSR        | One live render/stream lifetime           | Persist HTML plus an opaque postponed artifact         |
| Later request          | Starts a new render                       | Reconstructs authorized postponed boundaries and tasks |
| Context                | Live request/application context          | Reacquired by compiler-known public context name       |
| Continuations          | Browser/server component transitions      | Reused for server-to-later-server resumption           |
| Structural publication | Progressive range reveal or root fallback | Partition- and plan-authorized resumed patches         |

## Decision

Add partial prerendering as persistence around the existing compiler continuation, partition,
task-tree, Suspense, and refresh models. Do not create a second component execution model or
serialize JavaScript runtime objects.

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

Names remain provisional, but the public shape should be adapter-neutral and keep the artifact
opaque:

```ts
const result = await prerender(<Page />, {
	contexts,
	signal
});

result.html;
result.postponed;

const response = await resumePrerender(result.postponed, {
	request,
	contexts,
	signal
});
```

`postponed` is a branded framework value suitable for an application-selected storage layer. The
framework may encode and authenticate it directly or expose a storage envelope, but application
code cannot inspect or construct its executable identities.

## Artifact contents

The artifact may contain only validated framework-owned data:

- artifact schema and compiler/runtime protocol versions;
- build and execution-root identity;
- resolved root locale, per-message-owner source locales, catalog fingerprint, Unicode
  formatter/conversion-data version, and application unit-policy identity;
- partition, boundary, range, and generation identities;
- opaque continuation and operation identities;
- authorized serialized dependency and capture slots;
- pending task relationships, readiness, priority, and cancellation state;
- Suspense and Activity ownership needed to reconstruct postponed ranges;
- active enhancement component contracts, activator-selected canonical groups, target or direct `_`
  boundary generations, first-root-path and root-bearing-frame authority where applicable, context
  ordering, and postponed task relationships, represented by opaque framework identities rather
  than serialized instances;
- required public context snapshots when their declaration permits serialization; and
- names and residency requirements for server contexts that must be reacquired.

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

An artifact is authenticated and bound to its build, application, execution root, issued-at time,
expiry, and optional deployment generation. Encryption is required when authorized public values
are not safe for application-visible storage. Integrity verification occurs before operation lookup
or context acquisition.

The application owns storage location, retention, routing, and deployment rollout. The framework
owns size limits, schema validation, authentication hooks, replay policy, and disposal of any
framework-side retained record. Default artifacts should be single-use when resumed work can cause
effects; explicitly replay-safe read-only checkpoints may permit bounded reuse under a separate
policy.

## Resume execution

1. Validate envelope size, schema, authentication, expiry, build, and execution root.
2. Resolve only allowlisted continuation contracts from the exact retained build.
3. Reacquire named application/request contexts and verify residency and serialization policy.
4. Reconstruct ephemeral renderer partitions, postponed ranges, task frames, and readiness owners.
5. Reconstruct enhancement root-bearing frames only from saved compiler-authorized ownership and
   the currently validated branch/Suspense selection.
6. Resume generations with a new request cancellation root while preserving compiler-owned
   generation fencing.
7. Publish only patches authorized by the saved partition and structural plans.
8. Settle, cancel, or fail every reconstructed frame and release all acquired resources.

The resume request cannot access completed sibling partitions merely because they shared the
original component. Context lookup failure, retired build identity, or invalid operation identity
fails the postponed range through the configured recovery contract.

## Performance and reconstructed-lifetime constraints

Partial prerendering must preserve the disposal targets in
[`javascript-performance-improvements.md`](javascript-performance-improvements.md):

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

1. Define a versioned internal checkpoint schema and round-trip it entirely in memory.
2. Reconstruct one postponed Suspense boundary with no external context.
3. Reacquire named request/application contexts and protect secret/residency boundaries.
4. Resume nested partitions and structured task relationships.
5. Add authenticated serialization, expiry, size limits, and single-use replay protection.
6. Integrate adapter-neutral response and streaming contracts.
7. Add deployment retention and stale-build recovery guidance.

## Verification

- Schema and property tests for deterministic encoding, malformed values, size limits, and version
  rejection.
- Security tests proving secrets, contexts, callbacks, request objects, source text, and module paths
  cannot enter artifacts.
- Integration tests that prerender, destroy all runtime state, then resume in a fresh server host.
- Cancellation, expiry, replay, stale-build, missing-context, and retired-operation tests.
- Nested Suspense, Activity, server slot, task-tree, and structural-patch tests.
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
