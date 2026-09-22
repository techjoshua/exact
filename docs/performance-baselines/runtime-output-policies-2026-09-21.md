# Runtime and output policy screening, September 21, 2026

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

Measured source baseline: `70b73fa8`. Twenty-four private captures (12 pairs) completed. Identical renderer artifacts and complete response identities were asserted for each pair. No compiled component specialization.

Decisions: reject Node string retention. Carry Bun streaming work windows forward to integration and pressure-budget experiments. Bun string shorter probes improve scheduled-demand latency but fail the small-page throughput-ratio guard; do not accept them on latency alone. Node streaming uses identical code on both sides as a negative control.

This is screening evidence from dedicated output-mode hosts, not a shipped mixed-mode implementation. Each capture uses two drivers and a React comparison. Concurrency runs have 10-second warmup and four 15-second measurement stages. Demand runs have 30-second warmup and 60-second measurement at 10,000 offered RPS. Large cases expand both frameworks to 96 rows. Ratios use valid responses divided by the union of driver measurement spans, including drain. p99 ranges describe separate drivers, not confidence intervals.

## Demand

| Runtime/API | Stage                | eXact control RPS | eXact candidate RPS | React control RPS | React candidate RPS | Ratio change |
| ----------- | -------------------- | ----------------: | ------------------: | ----------------: | ------------------: | -----------: |
| node string | total-arrivals-10000 |             9,932 |               9,910 |             8,807 |               8,981 |        -2.2% |
| bun stream  | total-arrivals-10000 |             6,430 |               6,662 |             6,866 |               7,049 |        +0.9% |
| bun string  | total-arrivals-10000 |             9,983 |               9,995 |             9,036 |               9,030 |        +0.2% |
| node stream | total-arrivals-10000 |             9,648 |               9,724 |             3,706 |               3,614 |        +3.4% |

## Concurrency

| Runtime/API | Stage      | eXact control RPS | eXact candidate RPS | React control RPS | React candidate RPS | Ratio change |
| ----------- | ---------- | ----------------: | ------------------: | ----------------: | ------------------: | -----------: |
| node string | total-c16  |            12,105 |              11,127 |             8,559 |               9,558 |       -17.7% |
| node string | total-c32  |            14,618 |              13,053 |             9,510 |               9,917 |       -14.4% |
| node string | total-c64  |            16,008 |              14,032 |            11,001 |              10,162 |        -5.1% |
| node string | total-c128 |            13,504 |              13,729 |            11,579 |              10,932 |        +7.7% |
| bun stream  | total-c16  |             6,614 |               9,162 |             6,772 |               7,139 |       +31.4% |
| bun stream  | total-c32  |             7,050 |              10,238 |             6,928 |               7,277 |       +38.2% |
| bun stream  | total-c64  |             6,963 |               8,645 |             6,840 |               7,241 |       +17.3% |
| bun stream  | total-c128 |             6,717 |               7,579 |             6,946 |               7,199 |        +8.9% |
| bun string  | total-c16  |            10,541 |              10,862 |             9,054 |              10,236 |        -8.9% |
| bun string  | total-c32  |            11,873 |              12,138 |            10,081 |              11,303 |        -8.8% |
| bun string  | total-c64  |            12,118 |              12,355 |            10,585 |              11,587 |        -6.9% |
| bun string  | total-c128 |            11,041 |              11,930 |            10,727 |              12,152 |        -4.6% |
| node stream | total-c16  |            10,611 |              11,232 |             4,543 |               4,402 |        +9.2% |
| node stream | total-c32  |            11,818 |              12,706 |             4,557 |               4,463 |        +9.8% |
| node stream | total-c64  |            13,008 |              13,659 |             4,529 |               4,398 |        +8.1% |
| node stream | total-c128 |            11,828 |              12,989 |             4,402 |               4,507 |        +7.2% |

## Large

| Runtime/API | Stage      | eXact control RPS | eXact candidate RPS | React control RPS | React candidate RPS | Ratio change |
| ----------- | ---------- | ----------------: | ------------------: | ----------------: | ------------------: | -----------: |
| node string | total-c16  |             4,222 |               4,000 |             3,836 |               3,483 |        +4.4% |
| node string | total-c32  |             4,020 |               3,703 |             3,826 |               3,560 |        -1.0% |
| node string | total-c64  |             3,811 |               3,264 |             3,878 |               3,737 |       -11.1% |
| node string | total-c128 |             3,500 |               2,915 |             3,731 |               3,373 |        -7.9% |
| bun stream  | total-c16  |             1,841 |               2,221 |             1,851 |               1,813 |       +23.2% |
| bun stream  | total-c32  |             1,812 |               2,179 |             1,817 |               1,780 |       +22.8% |
| bun stream  | total-c64  |             1,790 |               2,029 |             1,819 |               1,783 |       +15.6% |
| bun stream  | total-c128 |             1,837 |               1,944 |             1,829 |               1,841 |        +5.2% |
| bun string  | total-c16  |             2,290 |               2,318 |             2,288 |               2,316 |        +0.0% |
| bun string  | total-c32  |             2,209 |               2,239 |             2,250 |               2,253 |        +1.2% |
| bun string  | total-c64  |             2,246 |               2,261 |             2,235 |               2,277 |        -1.2% |
| bun string  | total-c128 |             2,190 |               2,253 |             2,282 |               2,298 |        +2.2% |
| node stream | total-c16  |             2,704 |               2,919 |             1,381 |               1,485 |        +0.4% |
| node stream | total-c32  |             2,707 |               2,924 |             1,373 |               1,500 |        -1.1% |
| node stream | total-c64  |             2,435 |               2,957 |             1,479 |               1,493 |       +20.3% |
| node stream | total-c128 |             2,336 |               2,233 |             1,482 |               1,404 |        +0.9% |

## Scheduled-demand latency

| Runtime/API |      Control p99 |  Candidate p99 | Control capacity misses | Candidate capacity misses |
| ----------- | ---------------: | -------------: | ----------------------: | ------------------------: |
| node string |   60.45-60.54 ms | 64.03-64.09 ms |                   0.67% |                     0.90% |
| bun stream  | 139.26-146.30 ms | 90.81-91.14 ms |                  35.60% |                    33.31% |
| bun string  |   45.05-45.89 ms | 23.61-23.84 ms |                   0.17% |                     0.05% |
| node stream | 101.31-101.31 ms | 82.05-82.17 ms |                   3.50% |                     2.76% |

Raw captures preserve warmup, errors, invalid responses, and telemetry. Existing React Node-stream overload errors remain in the captures and are not treated as eXact gains. Focused results do not replace the public full-benchmark charts.

The [structured results](runtime-output-policies-2026-09-21.json) retains measured comparisons and capture metadata.
Bulk raw captures and build archives are not retained; see the [retention policy](benchmark-retention.md).
