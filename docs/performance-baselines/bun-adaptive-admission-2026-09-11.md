# Automatic native Bun admission, September 11, 2026

These initial policy screens used Bun's shared native event-loop observer. A later full SSR run
exposed interference between admission idle cleanup and unrelated monitoring. The independently
owned sampler and its repeated measurements supersede that observer implementation; the original
screens remain historical evidence for the admission policy.

Native Bun handlers now enable adaptive admission by default. The Fetch dispatcher observes all
request starts and derives native drain from Bun's pending-request counter. Handler resolution does
not count as transmission completion. Native drain includes disconnects, so errors and client tails
remain separate validation metrics. The adapter does not wrap or cache response bodies.

Four closely spaced requests start monitoring. Two high-lag baseline windows permit a bounded
scheduling trial. A trial must beat both surrounding immediate controls in drain rate and event-loop
lag. Successful policies are reassessed after 30 seconds or sooner when their benefit disappears;
failed trials back off. Sparse and idle traffic return to immediate starts. Batches release at most
32 starts through scheduler.yield(), with setImmediate as the fallback.

## Same-code policy controls

Production Bun 1.4.2 on this shared Windows PC. Two independent load drivers, total concurrency 32,
five seconds of warmup and eight measured seconds per population. The second population reverses
automatic and disabled policy order. Each request independently renders its complete document.

| Workload | API    | Automatic RPS, two populations | Disabled RPS, two populations | Automatic driver p99 ms | Disabled driver p99 ms |
| -------- | ------ | -----------------------------: | ----------------------------: | ----------------------- | ---------------------- |
| 3 rows   | string |                11,337 / 11,622 |                 8,526 / 8,518 | 5.35 to 8.71            | 5.61 to 11.73          |
| 3 rows   | stream |                10,289 / 10,395 |                 6,006 / 6,118 | 6.92 to 7.80            | 7.61 to 7.74           |
| 96 rows  | string |                  2,504 / 2,530 |                 2,552 / 2,576 | 15.65 to 23.05          | 15.31 to 15.41         |
| 96 rows  | stream |                  2,234 / 2,218 |                 1,912 / 1,928 | 26.19 to 26.69          | 22.02 to 24.61         |

The controller retained scheduling for the small fixture and for large streaming responses. It
rejected large-string trials in both populations. Large-stream driver p99 rose from 22.0 to 24.6 ms
with admission disabled to 26.2 to 26.7 ms with automatic admission. Native drain and event-loop lag
are not client p99 guarantees, so the throughput gain has a tail-latency tradeoff in that workload. The unsuccessful probes impose a small cost in
these short runs; automatic does not mean every request or workload is faster. All policy-control
responses passed full-document identity checks, and no request errors occurred.

The earlier focused React comparisons also preserve 8,000-RPS offered-load errors, missed arrivals,
and per-driver p95/p99. Those screening runs preceded the nested-admission ownership guard and the
final queued-cancellation check; the same-code small controls above use the final rebuilt adapter.
Large string controls preceded the final cancellation recheck. The full SSR refresh uses the final
implementation without the diagnostic controller-decision probe.

## Contracts and checks

The native integration test keeps a streamed body pending after its handler returns, then verifies
that native pendingRequests drains when the body completes. Unit tests cover response identity,
nested handler ownership and opt-out, sparse traffic, failed trials, changing workloads, idle cleanup,
pending-body accounting, bounded batches, cancellation, and scheduling failures.

All 28 unit tests and nine native Bun integration tests passed, as did workspace build, test type
checking, 88 harness tests, 112 build-script tests, platform boundaries, source architecture, package
contents, README checks, and focused lint. The build-script module graph does not import generated
adapter output: the native load worker imports it only inside its executable runtime path.

Use createExactBunHandler for framework endpoints or createBunRequestHandler for a complete native
Fetch dispatcher. Forward both request and server through wrappers; do not combine this counter
with a separate Bun routes map. Outer handlers own admission for nested endpoints. Node behavior,
the renderer, and compiler/hydration contracts are unchanged.

[Evidence archive](bun-adaptive-admission-2026-09-11-evidence.zip) includes the raw populations,
diagnostic workers, plans, and validation journal.
