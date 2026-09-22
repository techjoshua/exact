# Bun automatic output-policy integration, September 22, 2026

The final integration selects a progressive-render work window from the signal-bound host scheduler. It retains the existing string policy and initial adaptive Fetch admission. A single native observer counts all requests, including mixed string and stream routes. Explicit renderer scheduling callbacks and the adaptive opt-out retain precedence. Compiled components, sinks, transport backpressure, and Node scheduling are unchanged.

The private controls start at `70b73fa8`. Both sides use identical renderer bundles and emitted components, with the new progressive-only policy selector present in both. Only the adapter supplies the optional streaming policy. Complete response identities and frozen artifacts are checked. Large cases expand both frameworks to 96 rows. Each capture includes two drivers and a React comparison; RPS includes drain. Concurrency uses 10-second warmup and 15-second stages; scheduled demand uses 30-second warmup and 60-second measurement at 10,000 offered RPS. This focused protocol is distinct from the full suite with reversed populations and both 8,000 and 10,000 rates.

The first integration used a generic output selector. Its streaming ratios improved, but its string c32 ratio fell about 5%. That result is retained in the archive. The final revision preserves the original string helper and reads an optional `streaming` field only in the progressive entry point. These measurements do not isolate a single dispatch call as the cause of the earlier string result.

## Concurrency

| API    | Stage      | eXact control RPS | eXact candidate RPS | React control RPS | React candidate RPS | Ratio change |
| ------ | ---------- | ----------------: | ------------------: | ----------------: | ------------------: | -----------: |
| stream | total-c128 |             7,273 |               8,042 |             7,616 |               7,654 |       +10.0% |
| stream | total-c16  |             7,363 |              10,620 |             7,571 |               7,618 |       +43.4% |
| stream | total-c32  |             7,682 |               8,953 |             7,632 |               7,704 |       +15.4% |
| stream | total-c64  |             7,641 |               9,151 |             7,575 |               7,551 |       +20.1% |
| string | total-c128 |            11,920 |              12,417 |            12,228 |              11,861 |        +7.4% |
| string | total-c16  |            11,502 |              11,709 |            10,482 |               9,714 |        +9.8% |
| string | total-c32  |            12,967 |              13,237 |            11,502 |              10,891 |        +7.8% |
| string | total-c64  |            13,298 |              13,238 |            11,722 |              11,442 |        +2.0% |

## Large

| API    | Stage      | eXact control RPS | eXact candidate RPS | React control RPS | React candidate RPS | Ratio change |
| ------ | ---------- | ----------------: | ------------------: | ----------------: | ------------------: | -----------: |
| stream | total-c128 |             2,043 |               2,046 |             2,011 |               2,031 |        -0.8% |
| stream | total-c16  |             2,057 |               2,305 |             2,090 |               2,084 |       +12.4% |
| stream | total-c32  |             2,016 |               2,091 |             2,030 |               2,022 |        +4.1% |
| stream | total-c64  |             2,024 |               2,182 |             2,006 |               2,034 |        +6.3% |
| string | total-c128 |             2,476 |               2,478 |             2,594 |               2,554 |        +1.6% |
| string | total-c16  |             2,501 |               2,531 |             2,603 |               2,595 |        +1.5% |
| string | total-c32  |             2,469 |               2,450 |             2,520 |               2,521 |        -0.8% |
| string | total-c64  |             2,488 |               2,475 |             2,531 |               2,536 |        -0.7% |

## Demand

| API    | Stage                | eXact control RPS | eXact candidate RPS | React control RPS | React candidate RPS | Ratio change |
| ------ | -------------------- | ----------------: | ------------------: | ----------------: | ------------------: | -----------: |
| stream | total-arrivals-10000 |             6,880 |               7,110 |             7,248 |               7,311 |        +2.5% |
| string | total-arrivals-10000 |            10,000 |               9,999 |             9,329 |               9,351 |        -0.2% |

## Scheduled-demand latency

| API    |      Control p99 |    Candidate p99 | Control capacity misses | Candidate capacity misses |
| ------ | ---------------: | ---------------: | ----------------------: | ------------------------: |
| stream | 107.65–135.42 ms | 101.76–102.08 ms |                  31.12% |                    28.82% |
| string |   23.39–23.47 ms |   24.02–24.16 ms |                   0.00% |                     0.00% |

p99 ranges are separate driver observations, not confidence intervals. String results are preservation guards, not evidence of an intentionally faster string algorithm. The archive retains raw captures, telemetry, both integration revisions, source snapshots, plans, identities, and validation logs. These focused captures do not replace the full public charts.

[Structured comparison](bun-output-policy-integration-2026-09-22.json) and [evidence archive](bun-output-policy-integration-2026-09-22-evidence.zip). Archive SHA-256: `f7e897e3df6b3e6adeceac761e37426bd5e6ebcee8157f0a461d95f5d2d266c4`.
