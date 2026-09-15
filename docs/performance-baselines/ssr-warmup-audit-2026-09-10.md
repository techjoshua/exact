# SSR warmup and inactive-projector audit, September 10, 2026

Status: measurement audit completed. No production optimization is adopted or reverted in this audit; canonical applications remain the proven-reference build. The preceding rejected inline-projector artifact is used only as a diagnostic comparator.

## Why this audit was needed

The preceding inline-projector experiment showed slower Bun small strings even though short arrays should bypass generated projectors. Instrumenting registrations confirms zero projector calls for three-incident string and stream documents, and exactly 96 calls for the 96-incident documents, in both retained and candidate artifacts. Therefore a small-document timing difference cannot be credited to less work inside those callbacks. Code layout or runtime effects remain possible; inactivity alone does not prove identical overall execution cost.

Two controls with byte-identical retained code, plus the rejected candidate, run in six balanced permutations. Each process uses Bun production mode, 5,000 warmups, and 20,000 small string renders. One phase uses separate module paths; the next copies the selected artifact into one fixed scratch path before starting each fresh process. No writes overlap a timed process. Full eXact output hashes match. All populations are retained.

| Phase          | Identical control A, mean us | Identical control B, mean us | Candidate, mean us |
| -------------- | ---------------------------: | ---------------------------: | -----------------: |
| Separate paths |                        33.30 |                        33.57 |              33.41 |
| Same path      |                        33.81 |                        34.71 |              33.60 |

Identical-code populations vary substantially, including isolated values near 37-40 microseconds. These controls weaken attribution of the previous small-string difference to the compiler change. They do not prove the candidate faster or slower, and do not erase the earlier measurements. The candidate remains unadopted pending evidence from the path it actually changes.

## Timing across a process lifetime

Six fresh Bun processes render 100,000 small documents in twenty consecutive 5,000-render windows, with no discarded warmup. Retained, candidate, and React use two reversed orders. Timing excludes output reporting. Complete document/asset checks and final hashes remain in the worker. The table compares mean timing in windows after the first 5,000 renders with the final 50,000 renders. This is diagnostic evidence of time-dependent performance, not proof of a particular JIT or GC cause.

| Variant   | Order | Renders 5,001-20,000, us | Renders 50,001-100,000, us |
| --------- | ----: | -----------------------: | -------------------------: |
| current   |     0 |                    41.44 |                      30.01 |
| candidate |     0 |                    34.82 |                      30.75 |
| react     |     0 |                    33.11 |                      30.53 |
| react     |     1 |                    35.17 |                      34.54 |
| candidate |     1 |                    35.97 |                      28.00 |
| current   |     1 |                    35.02 |                      28.42 |

The fixed 5,000-render warmup is insufficient to describe late-run behavior for this Bun fixture. Late populations still vary, so 50,000 is a tested warmup here, not a universal convergence guarantee. Future focused comparisons should preserve timing windows or verify warmup for the workload instead of treating small percentage differences as automatically causal. Cold/short-warmup results remain meaningful when explicitly identified as such.

## Longer-warmup renderer comparison

Both Node and Bun use 50,000 warmups followed by 20,000 measured small renders, two reversed orders. Every framework receives the same counts. String and fully consumed stream modes remain separate. These are renderer/consumer microseconds, not requests/s. The candidate changes inactive projectors for this fixture, so any candidate difference is not evidence of reduced projector work.

| Runtime | Mode   | Retained eXact | Diagnostic candidate | React |
| ------- | ------ | -------------: | -------------------: | ----: |
| node    | string |          26.97 |                26.15 | 21.22 |
| node    | stream |          36.65 |                36.32 | 58.93 |
| bun     | string |          31.59 |                29.61 | 31.44 |
| bun     | stream |          47.60 |                47.43 | 55.87 |

## Longer-warmup HTTP comparison

This uses retained eXact and React only, with the ordinary controlled-service fixture and four asset tags. Both frameworks render their complete application-owned document. Node uses its Node HTTP adapter; Bun uses its native Bun response path. String and streaming modes remain separate. Two driver processes each use concurrency 16, with 10 seconds warmup and 6 seconds measurement. Two reversed orders across Node/Bun string/stream yield 16 populations. Response body identity and complete-document checks pass, with zero response errors. No build or validation process overlaps timed work. These measurements retain actual driver accounting and artifact identities.

| Runtime | Mode   | Retained eXact requests/s | React requests/s | eXact relative to React |
| ------- | ------ | ------------------------: | ---------------: | ----------------------: |
| node    | string |                    6589.7 |           8646.8 |                  -23.8% |
| node    | stream |                    5816.9 |           3806.0 |                  +52.8% |
| bun     | string |                    7856.3 |           8246.1 |                   -4.7% |
| bun     | stream |                    5957.6 |           5957.1 |                   +0.0% |

Renderer-only warmup effects do not establish equivalent HTTP capacity gains. Node string throughput remains below React. Workstation load and run duration differ from earlier captures, so cross-capture absolute RPS changes are not attributed to a code change. Use within-capture comparisons. The earlier public baseline is not replaced by this focused audit.

The next performance decision should prioritize active-path evidence under a verified warmup, retain the simple shared sink API, and preserve the existing full document and lifecycle contracts. The inline-projector candidate is eligible for reconsideration, but this audit alone is not sufficient to adopt it. No browser or package acceptance is claimed for a new change because production code is unchanged. Task-owned processes were closed and retained canonical hashes verified.

Evidence archive: `ssr-warmup-audit-2026-09-10-evidence.zip`. SHA-256: `7bc06924fbe2139bb60a334ac09430ed0b862afad26548e42535b0b977a441ec`. Contains instrumented activation probes, identical controls, warmup window workers, frozen artifacts, input data, raw renderer and HTTP captures, and verification output.
