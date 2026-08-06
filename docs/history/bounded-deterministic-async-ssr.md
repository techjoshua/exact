# Bounded deterministic async SSR

## Status

Implemented after
[`compiler-owned-render-programs.md`](compiler-owned-render-programs.md). This proposal implements
the accepted async SSR concurrency experiment in
[`javascript-performance-improvements.md`](../proposals/javascript-performance-improvements.md). It must land
before partial-prerender resumption and any adapter advertises concurrent sibling rendering.

The request-wide FIFO scheduler, `maxAsyncSsrConcurrency` normalization, isolated renderer frames,
ordered merge, cancellation fencing, nested permit yielding, and compiler proof for local neutral
context-free component siblings are implemented. Marker-bearing, document, inspection,
React-compatible, callback-observed, and unproven groups remain the exact serial fallback. This
final scope avoids speculative marker reservation and arbitrary callback reordering while allowing
nested proven groups to share one request-wide bound without deadlock. All SSR entry points,
request handlers, test hosts, and progressive options project the common render option.

## Decision

The compiler marks finite sibling groups as independent only when their render, context, task,
enhancement, identity, resource-hint, and output relationships can be isolated. Async SSR renders
those groups under a request-owned bounded scheduler, then publishes their HTML and side effects in
source order. Every unproven group remains serial.

`RenderToStringOptions` gains `maxAsyncSsrConcurrency?: number`. The default is 4, adapters may
lower it for constrained deployments, 1 selects the serial implementation, and values above 32 are
clamped. The limit is shared by nested groups and one request; nested rendering cannot multiply the
configured upstream concurrency.

## Compiler independence proof

A sibling edge is eligible only when the compiler can prove:

- no sibling consumes a context written by another sibling during setup or rendering;
- no parent/child enhancement target search, `_target` contribution, root-bearing frame, Suspense,
  Activity, portal, ref, or event ownership crosses the group;
- no authored output order affects task activation, inspection, server operation identity, or
  continuation/resumption capture;
- every dynamic identity and maximum marker/range reservation is finite; and
- failure can discard the sibling without bytes or resources already escaping its isolated result.

Immutable inherited contexts may be shared. Mutable request services may be referenced when their
own contract is concurrency-safe, but the compiler does not infer that property from an object
type. Unknown effects, dynamic calls, context writes, enhancement routing, or unbounded output make
the group serial and produce an inspection reason, not an author diagnostic.

## Isolated render frames

Each scheduled sibling receives a child render frame containing:

- an immutable view of request options, contexts, catalogs, logger, and cancellation;
- a compiler-reserved identity range or stable source-derived identities;
- isolated tree depth, node count, byte count, host/select stack, enhancement preparation, target
  contributions, document probes, resource hints, resumptions, and inspection observations; and
- an ownership ledger for component instances, tasks, scopes, and prepared boundaries.

Frames do not clone application contexts or retain the parent VNode graph. Successful frames return
one bounded result containing output chunks and ordered side records. Merge validates aggregate
node/byte/resource limits before publishing in authored order.

## Scheduling, failure, and cancellation

The scheduler is FIFO within a sibling group and request-wide bounded across nested groups. It
starts no new sibling after cancellation or the first failure. On failure it aborts active sibling
frames, waits for their owned cleanup, disposes successful unpublished frames in reverse ownership
order, and reports the same nearest error-boundary/fallback result as serial SSR.

Task deadlines use the request deadline, not a fresh timeout per sibling. Upstream database or HTTP
concurrency remains under application/service policy; the renderer limit is not permission to
bypass a service semaphore. Cleanup failures remain suppressed behind the primary render failure.

## Deterministic merge

HTML, markers, component-created/rendered observations, inspection events, resource hints,
resumptions, output extensions, and diagnostics publish in source order. Identity reservation makes
output independent of settlement order and configured concurrency. Duplicate resource hints use
the same first-authored winner as serial rendering.

Document roots, head/body discovery, React-compatible select state, and any output extension that
requires a whole-document view remain serial until a compiler/runtime proof provides an isolated
merge contract.

## Implementation order

1. Add compiler independence facts and inspection reasons to render-program/partition edges.
2. Add request-wide bounded scheduler and isolated child-frame planning without enabling it.
3. Reserve deterministic identities and merge ordered HTML/resource/inspection records.
4. Add failure, abort, deadline, cleanup, and aggregate-limit handling.
5. Enable proven intrinsic/component sibling groups for `renderToStringAsync`.
6. Reuse the scheduler for progressive SSR without delaying the shell or reordering reveals.
7. Project the option through Node, Fetch, serverless, Cloudflare, Deno, Bun, and framework hosts.

## Verification

- Exact-output tests compare concurrency 1, 2, 4, and 8 across repeated runs and settlement orders.
- Context tests cover immutable reads, rejected writes/dependencies, request isolation, and
  concurrency-safe service limits.
- Lifecycle tests cover construction/render failure, sibling cancellation, task deadlines,
  Suspense, fallback, cleanup failures, and child-before-parent disposal.
- Limit tests cover aggregate depth, nodes, bytes, chunks, hints, resumptions, and queued work.
- Concurrent-request tests prove one request cannot consume another request's slots or identity.
- Adapter tests prove option projection and cancellation from disconnected clients.

The final August 6, 2026 production-path five-process run of the accepted eight-sibling I/O
workload measured a 4.91x concurrency-four improvement (116.59 ms serial versus 24.42 ms), with
5.4% focused peak-heap growth. The paired CPU-throughput ratio was 5.3% better rather than
regressing. Concurrent-request
throughput, p95 latency, and cancellation cleanup remain release counter-metrics.

## Acceptance criteria

1. Only compiler-proven independent groups render concurrently.
2. Output and every observable side record are identical across settlement order and concurrency.
3. Request-wide and upstream concurrency remain bounded.
4. Failure and cancellation release all unpublished sibling ownership deterministically.
5. Serial execution remains the exact fallback for unproven groups and concurrency one.
6. I/O-heavy latency improves materially without unacceptable CPU, heap, or concurrent-request
   regression.
