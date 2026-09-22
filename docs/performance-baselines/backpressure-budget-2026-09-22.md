# Backpressure and CPU-budget screening, September 22, 2026

Status: rejected prototypes, not production changes. Node and Web Stream backpressure remain intact. The experiment adds cooperative CPU checkpoints without changing emitted components, response validation, output limits, or cancellation-capable host queues.

The initial sampled prototype did not latch a detected exhausted budget until the next turn. Its four completed Bun cases and interrupted Node case are retained separately, not used for acceptance. The corrected controller latches exhaustion. Sampling can avoid clock reads only while work is not already known to have exceeded the budget.

The corrected screen compares every-check, every-eight, and every-32 clock sampling at sink readiness, plus a Bun clock-only admission/resumption variant. A second screen moves CPU checks to actual output publications, either all publications or large body publications only. Each screen uses fresh eXact/React worker and service processes, two drivers, five seconds of warmup and 15 seconds each at total concurrency 32 and 128. Controls are the shipping Node policy and the dedicated Bun half-millisecond admission/resumption prototype. These are separate from full public benchmark captures.

## Traversal

| Runtime | Candidate | Concurrency | eXact control RPS | eXact candidate RPS | Ratio change |
| ------- | --------- | ----------: | ----------------: | ------------------: | -----------: |
| bun     | budget-1  |          32 |            10,344 |               6,267 |       -38.7% |
| bun     | budget-1  |         128 |             7,520 |               5,009 |       -30.3% |
| bun     | budget-32 |          32 |            10,344 |               6,624 |       -34.5% |
| bun     | budget-32 |         128 |             7,520 |               5,224 |       -28.7% |
| bun     | budget-8  |          32 |            10,344 |               5,924 |       -42.6% |
| bun     | budget-8  |         128 |             7,520 |               4,703 |       -33.0% |
| bun     | clock-8   |          32 |            10,344 |              10,354 |        -0.4% |
| bun     | clock-8   |         128 |             7,520 |               7,269 |        -4.8% |
| node    | budget-1  |          32 |            10,834 |              10,673 |        +1.1% |
| node    | budget-1  |         128 |            11,760 |               7,463 |       -34.0% |
| node    | budget-32 |          32 |            10,834 |              10,505 |        +6.6% |
| node    | budget-32 |         128 |            11,760 |               7,320 |       -31.2% |
| node    | budget-8  |          32 |            10,834 |               8,372 |       -17.7% |
| node    | budget-8  |         128 |            11,760 |               5,830 |       -48.3% |

## Publication

| Runtime | Candidate | Concurrency | eXact control RPS | eXact candidate RPS | Ratio change |
| ------- | --------- | ----------: | ----------------: | ------------------: | -----------: |
| bun     | budget-1  |          32 |            11,126 |               8,555 |       -21.6% |
| bun     | budget-1  |         128 |             7,874 |               5,787 |       -29.0% |
| bun     | large-1   |          32 |            11,126 |              10,727 |        -1.9% |
| bun     | large-1   |         128 |             7,874 |               7,390 |        -5.5% |
| node    | budget-1  |          32 |            12,412 |              11,083 |        +7.2% |
| node    | budget-1  |         128 |            11,737 |               7,268 |       -36.6% |
| node    | large-1   |          32 |            12,412 |              10,806 |        -2.0% |
| node    | large-1   |         128 |            11,737 |               9,805 |        -6.2% |

## Diagnostics and interpretation

The instrumented serial renderer performs 169 sink checkpoints on the small Node page and approximately 171 total budget checkpoints on Bun, including admission. The 96-row page has approximately 1,100 checkpoints. Every-eight sampling reduces small-page budget clock reads to about 22 per response, and every-32 to about six. These are counts from a diagnostic, not a separate throughput win.

In the corrected Bun burst diagnostic (five batches of 32), the control makes 148 positive scheduling decisions for 160 small-page responses. The every-32 traversal candidate makes 733, or about 4.6 per response. On the large page it makes 2,937, or about 18.4 per response, versus 150 control decisions. These counts include admission/resumption and exclude the initial serial warmup by subtracting telemetry snapshots.

Bun sends all 160 small control responses with Content-Length; the traversal candidate sends 82 as chunked and 78 with Content-Length. Both large-page variants are chunked. Node remains chunked on both sides. Extra suspensions activate promise continuations in the compiled writer and renderer cleanup paths. The measurements demonstrate additional scheduling and changed Bun framing; they do not isolate a causal percentage for each cost. Node also loses throughput without changing framing.

Independent untimed probes of retained code find Content-Length on both string paths, chunked Node streaming at both sizes, and Bun streaming with Content-Length on the 3,963-byte page but chunked on the 35,769-byte page. All four runtime/API bodies match at each size. eXact does not collect progressive output just to compute a Content-Length header. UTF-8 accounting for output limits is a separate correctness requirement.

No combined-budget candidate passes the small-page capacity guards. Publication-level checks reduce the traversal penalty but do not establish an adoption benefit. Scheduled-demand and larger-page throughput runs are not required to reject variants that already fail these guards. The original independent mode-policy study still supports advancing Bun streaming admission/resumption to a separately validated automatic integration.

[Structured results](backpressure-budget-2026-09-22.json) and [raw captures, prototype sources, probes, and hash manifest](backpressure-budget-2026-09-22-evidence.zip). Archive SHA-256: `dd5177031c02111ed7dd842c04aa7b7d2b55fd60c06076904afcabca60617415`.
