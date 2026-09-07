# Scope disposal and compiler traversal experiments

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

## Scope and method

These focused experiments follow the accepted component-local target ABI work. They do not
change component composition, early SSR task issuance, ordered publication, or the compiled ABI.
The Windows workstation remained available for ordinary use; timings describe these local
workloads, not production application speedups. Before/candidate order alternated within each
population. Raw captures, the measurement drivers, frozen source bundles, and compiler executables
are retained locally under `.tmp/ownership-traversal-experiments`.

## Conditional subtree queue cleanup

Previously each stopped effect scope scanned both global scheduler queues. Removing S scopes
while Q unrelated paused computations remained queued therefore repeated O(S × Q) inspection.
The retained candidate allocates a completed-owner set only when disposal begins with queued work,
then removes that subtree's entries in one queue pass after cleanup. An initially empty queue keeps
the existing per-scope purge path without allocating the set. Scheduling and priority selection are
unchanged; this is separate from the previously rejected priority-bucket scheduler experiment.

The first candidate allocated the set unconditionally. It improved the backlog workload but slowed
construction/disposal of 1,000 scopes with empty queues by about 23%, so that form was rejected.

The refined candidate used two warmup pairs and 50 recorded alternating pairs. Both source bundles
were produced with the same esbuild configuration. Timed work includes construction and disposal;
the unrelated queue is populated before the timer. Empty-root samples batch 10,000 iterations,
and empty-queue subtree samples batch 20 iterations, reporting time per iteration.

| Child scopes | Unrelated queued computations | Before median, ms | Candidate median, ms | Median paired candidate/before |
| -----------: | ----------------------------: | ----------------: | -------------------: | -----------------------------: |
|            0 |                             0 |        0.00009188 |           0.00009303 |                         1.0220 |
|        1,000 |                             0 |          0.087810 |             0.088060 |                         0.9991 |
|        1,000 |                         1,000 |            6.7550 |               0.1295 |                         0.0195 |
|        4,000 |                         4,000 |           98.6195 |               0.4895 |                         0.0049 |

The target scaling improvement is substantial. Empty-queue counter-metrics remain within 3% in
this focused population, including the small empty-root cost. The completed-owner set is temporary
and scales with the removed subtree; no index is added to scheduling or retained on live scopes.
The isolated minified probe bundle grows 142 raw bytes, 62 gzip bytes, and 53 Brotli bytes. These
are probe sizes, not production application bundle measurements.

Regression coverage protects paused work, cancellation of queued reaction ownership, unrelated
pending work, ancestor cleanup that enqueues against a stopped descendant, cleanup failure, and
reentrant disposal. The existing deep-scope, Activity, and scheduler tests remain applicable.
`benchmark:reactive` now includes `subtree disposal with unrelated paused backlog`, timing disposal
alone and verifying afterward that all unrelated queued computations still run on resumption.

## Compiler traversal pruning: retained redundant-work removal

The candidate stopped collection-capability analysis from descending into AST subtrees disjoint
from the component's source span. Ancestor traversal and component-local type checking were
unchanged. It added no cache and did not change capability policy.

Two persistent native processes compiled identical generated files containing 1, 50, or 200
components. Each request reset its compiler session to avoid transform-cache hits. Two warmup pairs
preceded 20 alternating recorded pairs per size. Every pair compared generated code and complete
analysis for exact equality. The first portion overlapped focused test activity, so small timing
differences are especially unsuitable for attribution.

| Components | Before median, ms | Candidate median, ms | Median paired candidate/before |
| ---------: | ----------------: | -------------------: | -----------------------------: |
|          1 |           23.4189 |              23.3532 |                         1.0153 |
|         50 |          367.0392 |             363.9523 |                         0.9874 |
|        200 |        4,969.1950 |           4,853.1647 |                         0.9844 |

The largest workload improves about 1.6% by the paired median. These timings are inconclusive
as evidence of a general compiler speedup. The five-line pruning check is retained because it
eliminates irrelevant traversal without a cache, ABI extension, or additional ownership machinery;
all compared code and analysis remain identical. A minimum timing improvement is useful when
deciding whether added optimization machinery earns its complexity, but is not sufficient reason
to reject a small removal of redundant work. This experiment does not justify another traversal
cache or claim a general compiler speedup.

## Validation

The workspace build, production and test type checking, full test command (1,986 package tests
plus application checks), 86 build-script tests, platform-boundary checks, package-content checks,
source architecture, JSDoc, explicit-any ratchet, and changed-file lint/format checks passed.
The documentation application verified and built successfully. After retaining the compiler
pruning, the native compiler was rebuilt with both its compiler and command test packages passing.

The reactive performance command passed, including the new backlog-disposal scenario at 0.65 ms
median and 0.80 ms p95, and compiled keyed 1,000-item rotation at 6.80 ms median and 7.88 ms p95
across five isolated processes. These are candidate guard results, not additional paired
improvement estimates. The full framework performance guard also completed its Node and Chromium
scenarios; its complete JSON report is retained locally as `framework-guard.json` beside the
other captures.

## Full framework comparison follow-up (2026-09-06)

All 35 controlled-service browser equivalence scenarios passed after rebuilding all five
participants. The follow-up collected 50 balanced browser rounds, 750 cold startup captures
(50 per participant at each of 1x, 4x, and 6x CPU rates), and the standard SSR matrices.
Raw evidence and the complete four-percentile report live under
`.tmp/scope-traversal-framework-comparison`. Browser and startup collectors owned and closed
their servers; comparable SSR workers remained simultaneously warm with balanced interleaving.

Selected current medians:

| Metric                                       |   eXact |   React | SvelteKit |    Nuxt | TanStack Start |
| -------------------------------------------- | ------: | ------: | --------: | ------: | -------------: |
| Optimistic feedback, ms                      |     1.5 |     1.5 |       1.3 |     1.0 |            1.5 |
| Interaction settlement, ms                   |    13.7 |    13.3 |      13.9 |    14.0 |           13.8 |
| Startup total script duration at 1x, ms      |  16.191 |  17.428 |     3.950 |   5.886 |         26.952 |
| Post-interaction retained JS heap, MB        |   2.501 |   2.303 |     2.078 |   2.334 |          2.758 |
| Node sustained throughput at c32, requests/s | 2,421.6 | 2,440.1 |   1,564.1 | 1,147.4 |        1,311.1 |
| Node sustained throughput at c64, requests/s | 2,415.4 | 2,452.4 |   1,583.5 | 1,160.9 |        1,294.2 |
| Bun sustained throughput at c32, requests/s  | 2,897.5 | 2,897.7 |   2,230.2 | 1,637.4 |        1,653.2 |
| Bun sustained throughput at c64, requests/s  | 2,850.2 | 2,848.6 |   2,190.1 | 1,689.2 |        1,628.4 |

Both SSR runtime matrices completed. Bun rows use eXact's native `Bun.serve` transport and
the other participants' Node-oriented artifacts through Bun's `node:http` compatibility layer.
Compare participants within each runtime row; the two transport profiles are not interchangeable.

Historical comparisons use `.tmp/react-renderer-final-checkpoint`, revision `7c7e065f`, versus
the current dirty working tree at `ece37924`. Other intervening commits are included, so these
differences do not isolate the two focused changes. Controls are React, SvelteKit, and Nuxt;
TanStack Start is excluded from normalization because it shares React's renderer.

Relative to that checkpoint, eXact's transferred script bytes increased by 543 and its retained
browser heap increased by 4,344 bytes. Median feedback moved from 1.8 to 1.5 ms, but the controls
were too dispersed to normalize that metric. Settlement increased by 0.388 ms after normalization.
Normalized total startup script duration moved +3.7%, -10.4%, and -6.4% at 1x, 4x, and 6x.
Node c32 throughput increased 4.4% raw but decreased 3.1% after control normalization; c64
decreased 3.5% after normalization. These mixed results do not establish a broad application
speedup from the focused changes.

The optional eXact startup source-module attribution could not find the emitted source map.
Timed populations and CPU/allocation captures completed; that diagnostic remains unavailable.
Chromium evaluation-trace durations and total script duration are reported separately rather
than treated as interchangeable measurements.

## Lower-allocation disposal follow-up (2026-09-06)

The comparison's 4,344-byte increase is retained browser heap after GC, not a measurement of
temporary teardown allocation. Its historical baseline also includes intervening commits. The
temporary completed-owner set therefore cannot be identified as the cause from that result.

A further retained change removes the two traversal records and separate child snapshot array
previously allocated for each stopped scope. One reference stack holds exit markers and child
snapshots; leaves finish directly without pushing an exit marker. Child-first insertion order,
reentrant sibling disposal, error handling, and queued-work ownership remain covered. The
conditional completed-owner set and mutation-safe reaction/cleanup snapshots remain.

Seven alternating before/after pairs used fresh Node processes per capture, 100 warmup disposals,
and the existing Node allocation profiler with a 1,024-byte sampling interval and collected
objects included. Trees and unrelated queued work were constructed before profiling. Empty
scope captures disposed 20,000 roots; each subtree capture disposed 100 roots of 1,000 children.
Values below are median sampled bytes per disposal, not exact allocation accounting or retained
application heap. Initial shared-process captures showed strong order effects, so the isolated
population is the evidence used here.

| Children | Unrelated queued work | Before bytes | After bytes | Median paired ratio |
| -------: | --------------------: | -----------: | ----------: | ------------------: |
|        0 |                     0 |        585.3 |       501.8 |              0.8583 |
|    1,000 |                     0 |    236,129.6 |   114,813.9 |              0.4860 |
|    1,000 |                 1,000 |    340,639.0 |   219,442.0 |              0.6440 |

The first marker-stack candidate increased empty-scope allocation; direct leaf completion removed
that counter-signal. A separate 50-pair timing population measured construction plus disposal.
Median paired after/before ratios were 0.8737 for an empty root, 0.8664 for 1,000 children without
queued work, 0.9052 for 1,000 children with 1,000 unrelated queued computations, and 0.9009 for
4,000 children with 4,000 queued computations. These focused measurements show reduced teardown
allocation and no timing regression in the tested populations; they do not establish a reduction
in retained application heap. Raw captures and drivers are under `.tmp/scope-disposal-allocation`.

The isolated minified probe grows 34 raw bytes, 30 gzip bytes, and 25 Brotli bytes relative to
the prior set-based disposal implementation. These are probe sizes, not application bundle sizes.
No fields are added to live scope instances and the compiled ABI is unchanged. Production and
test type checking, 1,987 package tests, source architecture, JSDoc, changed-file lint/format,
package-content checks, and platform-boundary checks passed.
The reactive performance guard passed: backlog disposal measured 0.64 ms median / 0.88 ms p95,
and the compiled keyed 1,000-item rotation measured 7.04 ms median / 7.29 ms p95. The full
framework-comparison tables above precede this follow-up; the subsequent rerun is recorded below.

## Full comparison after allocation reduction (2026-09-06)

The complete comparison was rerun with 35 passing correctness scenarios, 50 browser rounds,
750 startup captures, and full separate Node/Bun SSR matrices. The immediate baseline is
`.tmp/scope-traversal-framework-comparison`; new raw captures, normalization results, and the
complete p50/p75/p95/p99 report are under `.tmp/scope-allocation-framework-comparison`.
Sample counts, balanced interleaving, CPU rates, and measurement-round settings match that baseline.
All task-owned browser servers and compiler/runtime workers closed after measurement.

Selected eXact medians, with timing normalization using React, SvelteKit, and Nuxt:

| Metric                                   |    Before |     After | Control-normalized change |
| ---------------------------------------- | --------: | --------: | ------------------------: |
| Post-interaction retained JS heap, bytes | 2,501,072 | 2,501,072 |                        0% |
| Transferred script bytes                 |   197,258 |   197,284 | +26 bytes (deterministic) |
| Optimistic feedback, ms                  |       1.5 |       1.4 |                     -4.5% |
| Interaction settlement, ms               |      13.7 |      13.9 |                     +1.0% |
| Startup total script duration at 1x, ms  |    16.191 |    16.029 |                     +1.3% |
| Startup total script duration at 4x, ms  |    74.776 |    73.893 |                     +0.4% |
| Startup total script duration at 6x, ms  |   124.467 |   132.564 |                     +9.6% |
| Node sustained c32, requests/s           |   2,421.6 |   2,415.1 |                     -2.2% |
| Node sustained c64, requests/s           |   2,415.4 |   2,367.4 |                     -0.9% |
| Bun sustained c32, requests/s            |   2,897.5 |   2,895.4 |                     -0.6% |
| Bun sustained c64, requests/s            |   2,850.2 |   2,827.4 |                     +0.3% |

These application results do not show a broad speedup or recovery of the earlier 4,344-byte
retained-heap increase. The reduced transient teardown allocations remain a focused result.
Median startup heap is also unchanged at 1x and 4x; at 6x it decreases from 2,363,048 to
2,358,112 bytes. The 6x script-duration increase remains an adverse timing signal; a single
successive-run comparison does not establish its cause. It is retained in the evidence rather
than dismissed because other metrics improved.

Current Node c32 throughput is 2,415/2,432/1,595/1,198/1,289 requests/s for
eXact/React/SvelteKit/Nuxt/TanStack Start. Bun c32 throughput is
2,895/2,855/2,238/1,683/1,638 requests/s in the same order. Bun continues to compare eXact's
native transport with the other participants' Node-compatible transports. Optional eXact
source-module attribution again lacked the emitted source map; timed captures and CPU/allocation
profiles completed. No claim is made that the diagnostic became available in this rerun.

## Direct interleaved startup follow-up (2026-09-06)

The separate-run 6x signal prompted a direct comparison of the same two frozen client artifacts.
Both rebuilt artifact directories match the complete directory hashes recorded by the preceding
before and after runs. The before build restores only the old disposal traversal from the frozen
source bundle; the working source remains unchanged. The artifacts differ by 26 delivered script
bytes. Both passed an untimed claim interaction, and every startup sample verified the selected
script hash, decoded byte count, and identical semantic response.

Five warmup pairs preceded 100 recorded pairs at 6x CPU. Order alternated before/after and
after/before. Both variants used the same URL, the existing startup measurement routine, and
fresh cache-disabled browser contexts. No other benchmark ran concurrently. The served client
file was restored and all task-owned servers and workers closed. Frozen artifacts, raw pairs,
artifact validation, summaries, and the full report are under `.tmp/scope-startup-interleaved`.

| Startup script duration | Before, ms | After, ms |
| ----------------------- | ---------: | --------: |
| p50                     |    123.450 |   123.043 |
| p75                     |    145.258 |   150.355 |
| p95                     |    162.663 |   174.970 |
| p99                     |    190.438 |   205.879 |

The median paired after/before ratio is 0.9966. The geometric mean paired ratio is 1.0174,
with a descriptive 95% bootstrap interval of 0.9737–1.0637 from 10,000 resamples of complete
pairs. Before-first and after-first geometric ratios are 1.0339 and 1.0011 respectively;
ordering sensitivity remains visible. Pair bootstrapping does not eliminate possible temporal
dependence. Evaluation-trace median is 138.057 ms before versus 137.307 ms after; its geometric
mean paired ratio is 1.0127, with an interval of 0.9689–1.0585.

The direct population does not reproduce the earlier 9.6% normalized startup slowdown. Median
startup time is effectively unchanged, while after-build tail timings are higher. This is not
proof of zero impact or a general startup improvement. The earlier separate-run signal should
not be treated as an established regression caused by the disposal change. Retained startup
heap has a median paired ratio of 1.0; its small distributional differences do not establish
recovery of the earlier application retained-heap increase.
