# Compiler-planned server execution graphs

## Status

Proposed after
[`bounded-deterministic-async-ssr.md`](../history/bounded-deterministic-async-ssr.md) and
[`compact-hydration-publication.md`](../history/compact-hydration-publication.md). The completed
async SSR work schedules independent work after rendering discovers it. This proposal moves
eligible discovery earlier by compiling request-scoped reachability and data dependencies into a
server execution graph.

This proposal must be implemented before
[`partial-prerender-resumption.md`](partial-prerender-resumption.md) persists postponed task work.
Resumption should preserve one settled execution-graph contract rather than introduce a second
model for discovering and restarting server work.

## Decision

Compile finite, render-required server task invocations into a request execution graph. The server
runtime may start a graph node as soon as its reachability gate is satisfied, its ownership scope
exists, and every required input is available. It need not wait for recursive SSR traversal to
reach the component whose output eventually consumes the result.

The compiler binary remains a build-time dependency. Production servers execute generated
JavaScript and compact graph metadata through the ordinary eXact server runtime.

The compiler does not execute every task it can see. A task enters the graph only when source
contains an invocation contributing to the requested render and the compiler can preserve its
authored semantics. Interactive tasks, mutations, opaque calls, and lifecycle-sensitive work remain
at their authored execution point unless a later contract explicitly proves them movable.

## Motivation

Recursive rendering can create an avoidable data waterfall:

```text
render Page
  -> render Layout
     -> discover AccountPanel
        -> fetch account
     -> discover Recommendations
        -> fetch recommendations
```

When both nested invocations are statically reachable and their inputs are already available, the
compiled request graph can instead perform:

```text
request/application inputs
  -> start account query ------------------+
  -> start recommendations query ----------+--> render dependent regions
  -> continue synchronous render planning -+
```

This separates three events that recursive rendering normally conflates:

1. a component or branch becomes reachable;
2. a task has enough information and ownership to run; and
3. the task's consuming HTML region is ready to publish.

## Goals

- Start proven render-data work at the earliest semantics-preserving point.
- Represent dependencies on request context, application context, public/server component context,
  props, initialized component state, derived values, and preceding task results.
- Reuse the bounded request-wide async SSR scheduler, deadlines, cancellation, ownership ledgers,
  error routing, and deterministic publication.
- Preserve setup-once component instances and ordinary authored task calls.
- Expose why each graph node is unreachable, waiting, runnable, running, settled, or cancelled.
- Reduce nested server-data latency without increasing unbounded upstream concurrency or retained
  request state.

## Non-goals

- Running the compiler binary while handling production requests.
- Treating every task definition as an implicit request-time invocation.
- Speculatively executing both sides of a branch or every finite registry member.
- Moving mutations, one-time-token consumption, interaction work, or unknown effects earlier.
- Replacing component setup, task ownership, error boundaries, Suspense, or ordinary SSR output
  ordering.
- Requiring authors to construct dependency graphs, query descriptors, or framework-specific data
  loaders by hand.

## Compiled graph contract

The exact representation is internal, but one node is conceptually equivalent to:

```ts
type ServerExecutionNode = {
	readonly id: OpaqueOperationId;
	readonly owner: OpaqueComponentPlanId;
	readonly reachability: OpaqueReachabilityGate;
	readonly inputs: readonly ServerExecutionInput[];
	readonly predecessors: readonly OpaqueOperationId[];
	readonly effect: 'read' | 'unknown';
	readonly concurrency: TaskConcurrencyPolicy;
	readonly result: OpaqueResultBinding;
};
```

Input descriptors identify compiler-owned bindings, not serialized values or source property paths
that become a public protocol. Rich explanations and source ranges remain in server inspection
artifacts. Production graph records use build-scoped opaque IDs and compact indexes.

Supported input categories are introduced in this order:

1. request and application contexts available at request creation;
2. direct props whose complete value chain is known from request inputs or constants;
3. component-provided public/server contexts after their provider setup stage;
4. component state and derived values initialized by a proven setup prefix; and
5. results of preceding graph nodes.

An input being reactive does not make it available. The scheduler requires a concrete generation
of that binding, and invalidation or branch withdrawal fences stale settlement from publication.

## Reachability and setup

Reachability is independent from input readiness. A node can run only after both are proven.

- A statically present component path is immediately reachable.
- A conditional child becomes reachable after its selector resolves; the inactive branch is never
  executed merely to improve latency.
- A keyed-list item receives a generation-scoped graph instance only after its key and item inputs
  exist.
- A finite component registry selects one member before work below that member becomes reachable.
- Lazy module work begins only under its existing loading and trust contract.
- Server/client partition, component-library authorization, and context residency remain
  authoritative; graph metadata cannot grant execution permission.

Component setup remains ordinary setup-once execution. The compiler may split a proven pure setup
prefix from later rendering so that it can establish state, derived bindings, contexts, and task
ownership before DOM output is visited. If setup order, an opaque call, an enhancement root,
resource ownership, or a lifecycle registration cannot be advanced safely, the node remains
render-discovered.

The first implementation is deliberately narrower: statically reachable read-only server work
whose inputs are request/application contexts, constants, or directly traceable props and which
does not require advancing component setup.

## Scheduling and publication

The existing request-wide bounded scheduler owns execution. Graph readiness is permission to queue
work, not permission to exceed `maxAsyncSsrConcurrency` or an upstream service's own semaphore.

Graph scheduling must preserve:

- request deadline and abort propagation;
- task concurrency policy and generation fencing;
- nearest component error boundary and Suspense ownership;
- deterministic authored-order HTML, resource-hint, inspection, and continuation publication;
- reverse-order cleanup of unpublished successful work after failure; and
- serial fallback for an unproven or malformed graph region.

Rendering consumes graph results. It does not synchronously await unrelated nodes, and progressive
SSR may publish a region once that region's dependencies settle. A rejected or cancelled node
follows the same error/fallback behavior as the equivalent authored invocation discovered during
ordinary rendering.

## Tree containment and nested-set consideration

The immutable compiled plan is a good candidate for depth-first interval numbering. Giving each
plan node `{ entry, exit, depth }` makes containment a pair of integer comparisons:

```text
A contains B when A.entry <= B.entry and B.exit <= A.exit
```

That can cheaply validate reachability gates, cancellation of a withdrawn branch, ownership
containment, and whether one planned result belongs to a publication boundary. Because a compiled
plan is immutable for a build, interval labels never need to be renumbered.

The live component and mounted trees should not automatically adopt the database-style nested-set
model. They frequently insert, remove, replace, reparent, park, resume, and portal subtrees. Plain
nested-set labels make those operations require broad relabeling, while current parent pointers
already provide constant-time immediate-parent access and child arrays provide optimal
subtree-proportional descendant traversal. eXact also has distinct logical ownership and physical
DOM trees, so one pair of intervals could not correctly represent every relationship.

If profiling later demonstrates repeated live containment queries, evaluate an order-maintenance
or generation-scoped Euler-tour index as a derived cache. Do not add depth and interval fields to
every live `ComponentInstance` or `Mounted` record without measuring update cost, heap cost, portal
semantics, and invalidation complexity.

## Inspection and diagnostics

Inspection should report each planned invocation with a stable reason and source range:

- `unreachable` with its unresolved branch or registry gate;
- `waiting` with redacted dependency identities;
- `runnable`, `queued`, `running`, `settled`, or `cancelled`;
- `render-discovered` when early scheduling proof was rejected; and
- a rejection reason such as `unknown-effect`, `setup-order`, `context-write`,
  `dynamic-reachability`, `ownership-boundary`, or `placement-boundary`.

Expected conservative fallback is inspection information, not an author warning. Diagnostics are
reserved for contradictory placement, invalid task contracts, or graph invariants that cannot
produce correct ordinary execution.

## Implementation order

1. Emit inspection-only task invocation, input, reachability, effect, and ownership facts.
2. Build and validate a compact request graph while retaining ordinary render-discovered execution.
3. Schedule statically reachable read-only nodes using request/application contexts and direct
   props.
4. Join prestarted results at the authored invocation and prove exactly-once execution.
5. Add branch, keyed-item, registry, and lazy-component reachability generations.
6. Add proven setup-prefix, component-context, state, derived-value, and predecessor-result inputs.
7. Integrate progressive publication and the later partial-prerender resumption artifact.

## Verification

- Compiler tests assert semantic graph edges, reachability gates, effect rejection, placement, and
  source-located fallback reasons rather than exact generated text.
- Differential SSR tests compare graph scheduling with concurrency one and ordinary recursive
  discovery across settlement orders.
- Lifecycle tests cover exactly-once invocation, setup ownership, branch withdrawal, keyed
  replacement, registry changes, cancellation, deadlines, errors, and cleanup.
- Security tests prove that inactive branches, unauthorized packages, client work, secret contexts,
  and malformed opaque IDs cannot be executed through graph metadata.
- Nested scheduling tests prove one request-wide concurrency bound and no deadlock with existing
  sibling groups.
- Benchmarks include deep nested I/O waterfalls, CPU-only work, concurrent requests, peak heap,
  time to first byte, complete-render latency, and upstream concurrency.

## Acceptance criteria

1. Eligible nested read-only work starts when reachability, ownership, and inputs are ready rather
   than when recursive rendering reaches its component.
2. Output, side records, errors, and cleanup are identical to ordinary authored execution across
   concurrency settings and settlement orders.
3. A task is never executed merely because it is defined, statically discoverable, or present in
   an inactive branch.
4. Unknown effects, setup dependencies, placement, trust, or ownership fall back to ordinary
   render discovery without weakening validation.
5. Every graph node is request-owned, bounded, cancellable, generation-fenced, and observable.
6. Production execution requires no compiler process, source text, application closure metadata,
   secret value, or public module path.
7. Representative nested I/O workloads improve materially without unacceptable CPU, heap,
   compressed-byte, or concurrent-request regression.
