# Adaptive scheduling after data readiness, September 12, 2026

Status: a successful focused Node experiment, not a production policy change.
Source and built application artifacts remain at `33b32e89` throughout measurement.
This follows the [normal-loading investigation](ssr-data-path-2026-09-12.md).

## Hypothesis and implementation

The adapter currently decides whether to yield before invoking the application handler.
That handler then awaits two HTTP data requests. Once data arrives, rendering starts from
the fetch continuation without another adaptive checkpoint. Yielding there could recover
the observed roughly 4–6% Node string deficit by allowing socket work to progress before
another group of renders.

The diagnostic reuses the shipping Node adaptive controller and bounded scheduler. One
controller observes each incoming request and its successful response completion. It applies
its decision before fetching, after fetching, or at both points. There are no independent
controllers competing over the same traffic. The existing cancellation-owning Node handler,
renderer, hydration output, response writer, and React participant remain in use.

The final variant passes the adaptive callback through the existing SSR `scheduleRender`
option instead of explicitly awaiting it in the benchmark host. It captures the request's
abort signal for queued work. This verifies a framework-supported render entry checkpoint;
it does not test resumption from awaits inside the component tree.

## Method

Production Node 26.8.1 runs on the shared Windows PC. Each capture uses two independent
drivers, five seconds of warmup, eight seconds at total concurrency 32, and two fresh
populations with reversed framework order. Both frameworks fetch and decode fresh data on
every request and render the full application document. All complete response hashes and
expected application text are validated.

The initial policy order is current, post-fetch only, then both checkpoints. Confirmation
reverses the relevant policy order: both checkpoints, then current. Streaming receives its
own confirmation captures. PC workload can change; these are focused measurements, not a
replacement for the full benchmark charts or a long-duration scheduler reassessment test.

## String results

Valid RPS, with both populations retained:

| Capture                             |         eXact |  Nearby React | eXact driver p99 ms |
| ----------------------------------- | ------------: | ------------: | ------------------: |
| Initial current placement           | 2,428 / 2,542 | 2,656 / 2,673 |           16.7–18.0 |
| Post-fetch checkpoint only          | 2,938 / 3,043 | 2,518 / 2,688 |           16.3–16.5 |
| Both checkpoints                    | 3,319 / 3,071 | 2,684 / 2,700 |           15.5–16.1 |
| Confirmation, both checkpoints      | 3,138 / 3,150 | 2,715 / 2,678 |           16.0–16.1 |
| Confirmation, current placement     | 2,533 / 2,578 | 2,628 / 2,703 |           17.6–18.2 |
| Existing SSR hook, both checkpoints | 2,837 / 3,099 | 2,691 / 2,666 |           16.2–16.8 |

The reversed-order direct checkpoint comparison improves eXact throughput by approximately
22–24%, with lower p99. The public SSR hook also beats its nearby React controls, although
its two populations differ enough that its cost relative to the direct checkpoint is not
resolved. These variants confirm that scheduling placement matters even after raw rendering
has been optimized.

## Streaming results

| Placement        |     eXact RPS | eXact driver p99 ms |
| ---------------- | ------------: | ------------------: |
| Both checkpoints | 2,536 / 2,872 |           17.9–19.4 |
| Current          | 2,318 / 2,380 |           18.2–18.5 |

Streaming throughput also rises, but p99 is mixed. The first added-checkpoint population
has a worse tail than either current population. Do not describe this as a universal latency
improvement or extrapolate it to Bun, sparse requests, preloaded documents, or larger bodies.

All eight captures, comprising 32 participant blocks, finished with zero request errors and
zero invalid responses. Per-driver p95/p99, queue totals, and controller checkpoint counts are
retained in the [evidence archive](ssr-resume-admission-2026-09-12.zip).

## Integration direction

The supported direction is to retain one adapter-owned policy and consult it again when
awaited application data becomes ready to render. There is no reason to replace the shared
render engine or universally delay every component task. Ready work with an immediate policy
still proceeds directly.

Production integration must preserve request cancellation, avoid duplicate observations,
and distinguish a meaningful post-await checkpoint from redundantly yielding before work
that has not suspended. In-tree task resumption also needs to preserve early head publication.
This pass establishes the performance opportunity using the existing render-entry hook;
it does not introduce a new public adapter API or change the default policy.

## Runtime and generated-code review

The compiler's `jsx_render_program_ssr_frame.go` already snapshots continuation locals
only on a pending branch. Its shared postlude resumes through `pending.then(...)`.
`jsx_render_program_ssr_continuation.go` uses that machinery for both pending render
values and sink readiness. Adding an unconditional scheduling operation to this
postlude would therefore affect transport drains as well as component work.

The runtime has more specific boundaries. In `direct-component-scheduling.ts`,
`drain()` tests `execution.blockingWork()` and returns immediately when no task is
pending. `prepareOutput` similarly distinguishes pending readiness from immediate
output. These are candidates for measuring task-resumption scheduling without
inserting a check into every generated write. They do not cover application data
awaited before the render entry point, which is the boundary measured above.

The next comparison should separate render entry after host data loading, actual
component task readiness, and transport backpressure. Use one host-owned adaptive
policy, preserve the synchronous ready path, and test whether one readiness event
causes redundant yields as child completion propagates through parent programs.
Compiler changes are warranted if those measurements show that the runtime lacks
the information needed to identify the useful continuation boundary. Neither the
compiler nor the component should hard-code a platform scheduler.

Evaluate throughput together with p95/p99, sparse-request latency, early head
publication, and cancellation. The existing `AsyncSsrScheduler` limits concurrent
task work; that is a separate responsibility from yielding CPU work to the host
event loop. Increasing task concurrency or delaying task I/O is not equivalent to
admitting a ready render continuation.
