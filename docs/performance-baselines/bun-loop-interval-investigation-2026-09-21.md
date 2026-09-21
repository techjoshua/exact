# Bun callback-interval and work-window investigation

No scheduler candidate from this investigation was adopted. These experiments used revision
`cbf96b235efcf106beb3d4c75a2e41b99623e775` and the
[September 20 full capture](bun-admission-final-2026-09-20.md) as their published reference.
They did not recover overloaded Bun streaming. No new full benchmark was run for these
rejected scheduler candidates.

## What was compared

The proposed signal was the interval between successive `setImmediate` callbacks. Two direct
interval controllers were tested, followed by elapsed-work windows bounded by immediate markers.
These are different mechanisms: a work window begins at the first request or SSR checkpoint
after a marker and expires when its next marker runs. It does not measure a complete native
event-loop iteration.

Experiments used Bun 1.4.2, Node v26.9.0 drivers, current workspace-resolved 0.6.0 participants,
and serial private Linux loopback namespaces on the same WSL host. Copied adapter modules kept
production artifacts unchanged. Each capture records the experimental adapter separately.
Native response ownership, rendering, cancellation, and the bounded scheduler remained intact.

The evidence contains 105 completed focused captures with no request errors or invalid responses,
plus one explicitly interrupted capture that is excluded from results. This count includes
diagnostic instrumentation and repeat populations, not 105 independent estimates of one effect.
Prepared but unmeasured variants are not results. Raw captures, copied adapters, runners,
plans, execution journals, and working notes are in the
[evidence archive](bun-loop-interval-investigation-2026-09-21-evidence.zip).
The [structured summary](bun-loop-interval-investigation-2026-09-21.json) lists the capture inventory
and the decisive comparisons.

## Candidate selection

The direct callback-interval controller did not establish a broad improvement. Its first streaming
eXact/React ratio changes were approximately −2.2% at c32 and +2.1% at c128. Its first 8,000-RPS
string demand test had 21.3 ms response p99 versus 12.4–12.6 ms for the current controller.
Lower interval thresholds reduced that candidate's p99 to about 16 ms. Individual captures
are screening evidence, not confidence intervals.

A fixed 0.5 ms work window produced substantial small-document streaming gains. An order-balanced
current/candidate/candidate/current sequence improved mean eXact/React ratios by 35.0%, 50.8%,
and 18.9% at c16, c32, and c128. However, the larger 96-row string fixture lost approximately
17–19% absolute throughput. Quarter- and eighth-millisecond windows also lost approximately
16–21% relative to React in fresh larger-string controls. Always scheduling also regressed that
fixture. Removing either the Fetch-admission or SSR-checkpoint boundary, or granting a one-use
admission credit, did not recover its performance. The initial fixed-window production draft
was therefore restored rather than adopted.

A guarded candidate retained the current trial controller and used the 0.5 ms window only while
scheduling was selected. Two order-balanced string sequences used the publication protocol:
10 seconds of c16 warmup, then 15 seconds each at c16/c32/c64/c128, with two drivers and reversed
framework order in half the runs. Combined mean eXact/React ratios improved by 2.6%, 4.5%, 2.3%,
and 2.6%. This resolved the small unfavorable ratios in the first sequence, but scheduled-demand
tests exposed a separate regression.

## Scheduled demand is a separate comparison

Each focused demand case uses a fresh worker, two drivers, 30 seconds of target-rate warmup,
and 60 seconds of measurement. Each driver permits up to 256 in-flight requests. Unlike the
fixed-concurrency tests, arrivals continue at the offered rate when the server falls behind.
Missed arrivals have no response-latency observation. P99 ranges below span the two individual
driver percentiles; the historical full capture spans four driver/population percentiles.
These are not pooled percentiles or confidence intervals.

At 10,000 offered RPS:

| Runtime/API and capture                 | Valid RPS | Missed arrivals | Response p99, ms |
| --------------------------------------- | --------: | --------------: | ---------------: |
| Bun streaming, published September 20   |     6,681 |          33.11% |    108.29–136.32 |
| Bun streaming, fresh current controller |     6,297 |          36.94% |    118.53–153.86 |
| Bun streaming, guarded candidate        |     6,580 |          34.12% |    104.00–145.92 |
| Bun string, published September 20      |     9,998 |           0.00% |      23.42–24.42 |
| Bun string, fresh current controller    |    10,000 |           0.00% |        7.01–7.05 |
| Bun string, guarded candidate           |     9,959 |           0.40% |      57.28–57.38 |
| Node streaming, published September 20  |     9,866 |           1.34% |      72.26–77.82 |

The last row is Node streaming, not Bun string. The fresh 7 ms control and 57 ms candidate
comparison concern Bun string only. Historical throughput changes do not isolate the candidate's
effect: the unchanged implementation also differs from its published capture. No fresh Node
measurement was part of this Bun experiment.

At 8,000 offered RPS, fresh Bun streaming measured 6,184 valid RPS, 22.59% misses, and
127.74–155.90 ms p99 for the current controller. The candidate measured 6,174 RPS, 22.71% misses,
and 151.94–157.06 ms p99. The fixed-concurrency gains therefore did not establish recovery under
scheduled demand. At 10,000 offered RPS the candidate improved throughput by about 4.5% against
the fresh control, but remained below the historical published result.

## What the traces explain

An instrumented string repeat reproduced the unfavorable demand result: the candidate delivered
9,885 valid RPS with 61.70–61.86 ms p99, while the current controller sustained 10,000 RPS with
12.52–12.73 ms p99. In one-second policy snapshots, the candidate's sampled event-loop thread
utilization averaged 90.2%, with no established-headroom snapshots. It repeatedly entered control
and trial phases. The current controller averaged 84.7%, established headroom in 85 snapshots,
and remained selected after startup. These averages include warmup and are diagnostic samples,
not a separately measured whole-run CPU percentage.

The candidate's higher CPU use prevented the existing headroom rule from deferring disruptive
control windows. A fixed-capacity improvement does not guarantee lower CPU use at paced demand.
Relaxing that rule would change the existing saturated-workload protection and has not been
validated as a remedy.

Under 8,000-RPS streaming overload, a separate instrumented candidate run recorded 893,339
work-window checks, of which only 32,307 (3.62%) permitted immediate execution. The window
requested scheduling on the other 96.38%. This explains why the window offered little relief
under this load, despite its benefit at lower fixed concurrency. The diagnostic run itself
is not substituted for the uninstrumented capacity comparison.

Controls that kept the scheduling decision fixed did not establish a large net penalty from
the existing observation bookkeeping. A smaller controller can introduce more callback work:
the initial direct immediate probe ran about 4,007 callbacks per second in normal loading,
versus about 202 in preloaded streaming. State count alone is not an adequate cost estimate.

## Outcome and limits

Direct callback intervals and unconditional work windows are not supported as replacements by
these measurements. Guarding the window preserves policy rejection for large responses, but
does not eliminate the demand-latency regression or recover overloaded streaming. Production
and the published charts are unchanged. This investigation explains why these candidates were
rejected; it does not claim that the remaining Bun streaming throughput limit has been fully
attributed or resolved.
