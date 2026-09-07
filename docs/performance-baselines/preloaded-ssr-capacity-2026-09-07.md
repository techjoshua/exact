# Preloaded SSR capacity — September 7, 2026

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Current eXact and React reach approximately 9,100 valid requests per second at their best measured
fixed concurrency on this host. Their best aggregate results differ by only 0.3%; this capture does
not establish a consistent winner. React retains more throughput at higher concurrency. Scheduled
arrivals saturate both nearer 7,600 RPS, so the fixed-concurrency maximum is not a promise that either
can sustain 9,100 independently arriving requests per second without queueing.

This follow-up to the [sustained comparison](sustained-ssr-load-2026-09-06.md) includes current eXact
and React only. The raw archive (local capture: `preloaded-ssr-capacity-2026-09-07.json`) preserves plans, sources,
artifact hashes, individual histograms, time series, and analysis. No framework code was changed.

## Method

The existing production artifacts ran on the same Windows/Ryzen 7 8745HS workstation under Node
24.11.1. Requests reused decoded fixture data through the benchmark's preloaded path. Data-loading
telemetry counts stayed zero, and response identities were validated throughout. The reusable
[load runner](../ssr-load-testing.md) now accepts top-level `"preloaded": true` for this diagnostic.

Each experiment used two fresh process populations with eXact/React then React/eXact ordering.
Load generation, the worker, and the controlled service occupied separate processes on one host.
No other benchmark or build ran alongside a timed stage.

1. One-driver sweep: 20-second warmup, then 20 seconds each at concurrency 8, 16, 32, 64, and 128.
2. Two-driver sweep: 15-second warmup, then 20 seconds each at total concurrency 16, 32, 64, and 128.
   Each driver owned half the total concurrency against one worker. This follow-up addressed the
   first sweep's driver CPU limit.
3. Two-driver scheduled arrivals: 15-second warmup, then 30 seconds each at total arrival rates of
   8,000 and 10,000 per second, split equally between drivers. Each driver capped outstanding requests
   at 256, allowed 50 ms scheduling lag, and used a 10-second absolute timeout.

Two-driver measured stages started within 0–2 ms of one another. Aggregated throughput divides total
valid responses by the union of both stage time spans, including drain, then combines populations by
total requests and elapsed time. Percentile ranges retain individual driver/population values and
are not pooled percentiles. Multi-driver orchestration is preserved in the archive's `runner` fields;
the ordinary coordinator still owns one driver per participant block.

## Fixed-concurrency results

| Total concurrency | One driver: eXact RPS | One driver: React RPS | Two drivers: eXact RPS | Two drivers: React RPS |
| ----------------- | --------------------: | --------------------: | ---------------------: | ---------------------: |
| 8                 |                 8,029 |                 8,013 |                      — |                      — |
| 16                |                 8,260 |                 8,166 |                  9,130 |                  9,094 |
| 32                |                 8,123 |                 8,275 |                  8,895 |                  9,106 |
| 64                |                 7,964 |                 8,029 |                  8,566 |                  8,858 |
| 128               |                 7,846 |                 7,838 |                  8,392 |                  8,778 |

The single driver used approximately one core. Two drivers raised throughput while each used roughly
53–62% of one core and the worker stayed near 99–100%. Increasing concurrency beyond the observed
peak did not raise throughput. This supports a worker-side plateau for the measured preloaded
HTTP path, rather than accepting the single-driver plateau as the framework limit.

At total concurrency 16, two-driver response p99 was 2.39–2.47 ms for eXact and 2.35–2.44 ms for React.
At concurrency 128, it rose to 17.52–18.02 ms and 17.34–18.83 ms respectively. More outstanding work
mostly increased latency.

Population results also matter. At concurrency 16, eXact measured approximately 9,094/9,167 RPS and
React 8,994/9,195 RPS: the ordering reversed. React's c32 populations were approximately 8,769/9,444
RPS. Its higher-concurrency advantage in the aggregate should be read alongside that population
variation, not as a machine-independent percentage.

## Scheduled arrivals

| Offered requests/s | eXact valid RPS | React valid RPS |      eXact capacity misses |      React capacity misses |
| ------------------ | --------------: | --------------: | -------------------------: | -------------------------: |
| 8,000              |           7,580 |           7,590 |   24,245 / 480,000 (5.05%) |   23,582 / 480,000 (4.91%) |
| 10,000             |           7,674 |           7,612 | 138,502 / 600,000 (23.08%) | 142,238 / 600,000 (23.71%) |

There were zero request errors and zero scheduling-lag misses. Additional stage-deadline misses
were 12/9 for eXact/React at 8,000 arrivals and 2/11 at 10,000. Capacity misses are offered requests
the driver did not dispatch because its outstanding-request cap was full, not failed responses.

Request-only p99 was approximately 70–73 ms; driver scheduling-lag p99 was approximately 2.4–3.1 ms.
The workers remained CPU-bound. Increasing offered demand mainly increased missed admissions.
Thus both rates demonstrate saturation under this arrival pattern; this test does not establish
the highest arrival rate that would have zero capacity misses.

Scheduled arrivals and fixed-concurrency loops produce different connection/queue histories.
These measurements establish the difference but do not individually attribute it to request
scheduling, connection handling, allocation, or another mechanism. The approximately 9,100 RPS
result describes the measured fixed-concurrency render/response path, including HTTP and benchmark
instrumentation, rather than pure renderer speed or an absolute framework ceiling.

## Validation and documentation

All 69 comparison tests passed, as did targeted lint and formatting. The live captures exercised the
new preloaded option. All captured stages reconcile demand, completion, and interval counters;
there were no request errors or telemetry sampling errors. Target entry hashes and shared runtime
artifacts remained stable. Owned benchmark processes were closed after each run.

Engineering guidance and the public performance page explain the preloaded diagnostic. Existing
five-framework charts retain their normal-loading capture because mixing these protocols would
misrepresent application request performance.
