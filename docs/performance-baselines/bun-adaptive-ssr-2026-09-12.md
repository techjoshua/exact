# SSR refresh with automatic native Bun admission, September 12, 2026

This capture measures the [native Bun admission implementation](bun-adaptive-admission-2026-09-11.md)
with the [independent observer](bun-observer-isolation-2026-09-11.md) on Bun source commit `95ac51ac73ee4a159a315f8f8e298087a43378a8`. Node and native Bun both use their default adaptive admission policies.
Node capacity captures from the same session retain commit 906a3439. Its Node adapter and rendered
application artifacts are unchanged by the Bun observer fix. All six Bun capacity captures and both
SSR diagnostic modes were rerun after that fix. The earlier failed diagnostic and superseded Bun
captures are preserved as investigation evidence, not substituted into the current Bun charts.
Production Node 26.8.1 and Bun 1.4.2 ran on the same shared Windows PC with variable foreground usage.
Both frameworks render their full authored document and application tree. String and stream APIs
remain separate. React rendering and transport are unchanged. No response bodies are cached or shared.

Two independent load drivers validate complete response hashes. Both fresh populations are retained,
with framework order reversed in the second population. Rates count valid completed responses.
Older captures are historical context rather than idle-PC controls. The focused policy experiment
linked above separately compares automatic and disabled admission on the same eXact implementation.

All packages and comparison applications were rebuilt, and the measured server bundles were frozen.
Only unrelated untracked output directories account for the dirty-workspace flag. Tracked source
remained unchanged throughout measurement. The server-package rebuild changed only a redundant
`unknown | undefined` annotation in one declaration file. Re-emitting TypeScript 6 reproduces the
original Node-capture artifact hash, and all executable JavaScript is byte-identical. The structured
capture records that emission comparison rather than discarding the original artifact identities.

## Sustained capacity

Preloaded capacity isolates rendering and HTTP delivery; normal loading includes fetching application data.
Both modes below use total concurrency 32. RPS counts valid completed responses. Tail ranges span drivers
and both populations.

| Runtime | API    | Loading   |       eXact RPS |     React RPS | eXact driver p99 ms | React driver p99 ms |
| ------- | ------ | --------- | --------------: | ------------: | ------------------- | ------------------- |
| Node    | string | preloaded | 13,023 / 14,711 | 9,815 / 9,809 | 3.2 to 10.0         | 4.1 to 4.8          |
| Node    | string | normal    |   2,610 / 2,588 | 2,757 / 2,721 | 16.4 to 17.2        | 15.9 to 16.0        |
| Node    | stream | preloaded | 10,963 / 11,070 | 4,018 / 3,939 | 5.6 to 10.8         | 10.5 to 11.0        |
| Node    | stream | normal    |   2,374 / 2,312 | 1,922 / 2,007 | 18.0 to 19.1        | 21.5 to 22.7        |
| Bun     | string | preloaded | 11,961 / 12,043 | 8,903 / 8,625 | 5.1 to 7.5          | 5.2 to 5.5          |
| Bun     | string | normal    |   4,324 / 4,347 | 4,348 / 4,357 | 9.0 to 9.3          | 9.0 to 9.3          |
| Bun     | stream | preloaded |  10,208 / 9,707 | 6,271 / 6,256 | 7.0 to 7.2          | 7.0 to 12.6         |
| Bun     | stream | normal    |   4,215 / 4,257 | 4,310 / 4,286 | 9.8 to 10.1         | 9.3 to 9.7          |

## Scheduled demand

Misses are requests the load generator could not start on schedule, distinct from response errors.
The public charts retain each runtime, API, offered rate, valid RPS, misses, errors, and response tails.
Missed arrivals below include capacity, driver-lag, and end-of-stage misses across both populations.
The capacity-only subset is shown separately; p99 ranges span individual drivers and populations.

| Runtime/API | Framework | Offered RPS | Valid RPS, two populations | Errors | Missed arrivals | Capacity misses | Driver p99 ms  |
| ----------- | --------- | ----------: | -------------------------: | -----: | --------------: | --------------: | -------------- |
| Node string | eXact     |       8,000 |              7,989 / 7,919 |      0 |           1,644 |           1,598 | 53.5 to 71.9   |
| Node string | eXact     |      10,000 |              9,890 / 9,886 |      0 |           4,305 |           4,264 | 67.5 to 68.5   |
| Node string | React     |       8,000 |              7,965 / 7,953 |      0 |           1,058 |           1,050 | 65.0 to 70.4   |
| Node string | React     |      10,000 |              8,124 / 8,123 |      0 |          74,121 |          74,111 | 79.4 to 84.0   |
| Node stream | eXact     |       8,000 |              7,910 / 7,915 |    148 |           3,275 |           3,216 | 84.3 to 86.1   |
| Node stream | eXact     |      10,000 |              9,413 / 9,544 |      0 |          20,852 |          20,693 | 88.6 to 92.0   |
| Node stream | React     |       8,000 |              3,857 / 3,868 |  2,465 |         162,058 |         162,044 | 146.3 to 148.7 |
| Node stream | React     |      10,000 |              3,932 / 3,932 |      0 |         241,765 |         241,736 | 136.3 to 138.4 |
| Bun string  | eXact     |       8,000 |              7,999 / 7,999 |      0 |               8 |               0 | 22.5 to 32.2   |
| Bun string  | eXact     |      10,000 |              9,894 / 9,916 |      0 |           3,770 |           3,760 | 65.5 to 69.4   |
| Bun string  | React     |       8,000 |              7,758 / 7,727 |      0 |           9,283 |           9,275 | 69.6 to 69.7   |
| Bun string  | React     |      10,000 |              7,751 / 7,711 |      0 |          89,808 |          89,779 | 69.2 to 70.0   |
| Bun stream  | eXact     |       8,000 |              7,935 / 7,938 |      0 |           2,467 |           2,454 | 82.4 to 83.6   |
| Bun stream  | eXact     |      10,000 |              9,782 / 9,674 |      0 |          10,739 |          10,728 | 85.6 to 87.0   |
| Bun stream  | React     |       8,000 |              6,128 / 6,171 |      0 |          73,060 |          73,055 | 86.8 to 88.4   |
| Bun stream  | React     |      10,000 |              6,082 / 6,153 |      0 |         154,355 |         154,308 | 88.4 to 88.6   |

### Request-error categories

| Capture              | Framework | Population | Stage               | Error counts        |
| -------------------- | --------- | ---------: | ------------------- | ------------------- |
| node-stream-arrivals | react     |          1 | total-arrivals-8000 | ECONNREFUSED: 1,353 |
| node-stream-arrivals | react     |          2 | total-arrivals-8000 | ECONNREFUSED: 1,112 |
| node-stream-arrivals | exact     |          2 | total-arrivals-8000 | ECONNREFUSED: 148   |

The capacity captures recorded 0 invalid responses and 2,613 request errors.
Warmup stages, excluded from measured rates, recorded 0 additional request errors.
Error categories: {"ECONNREFUSED": 2613}

Missed arrivals and request errors remain visible in the published data. They are not removed
to obtain a clean chart. These results reflect this PC during the capture; differences from older
idle-PC runs are not attributed to the code change.

## Scope and verification

All 16 stages completed: 112 live Node/Bun string/stream browser correctness checks, twelve
capacity captures, both full SSR diagnostic API modes, and the server performance suite.
Capacity uses ten-second warmups, fifteen-second concurrency stages, twenty-second normal-loading
stages, and twenty-second offered-load stages. Both populations are retained. SSR diagnostics use
500 sequential samples and 500 concurrency waves per supported framework and runtime.

The [September 11 client capture](client-full-2026-09-11.md) remains the source of browser timing,
startup, and heap charts. Those measurements were not rerun or assigned the new SSR capture date.
The public documentation charts are refreshed only for SSR.

The [structured capture](bun-adaptive-ssr-2026-09-12.json) preserves raw-source identities, capacity
summaries, execution commands and exit statuses, validation evidence, and unchanged historical
browser metadata. Per-driver tails are ranges, not averaged or pooled percentiles.

The final checks passed: 28 Bun adapter unit tests, 11 native Bun integration tests, 88 benchmark
harness tests, 112 build-script tests, package and platform checks, documentation type checking,
10 documentation tests, and the documentation build. Desktop and mobile browser checks verified
chart values against the published data, with no page errors or horizontal overflow. The
[verification journal](bun-adaptive-ssr-2026-09-12-verification.json) preserves the check results,
including the corrected documentation metadata type and declaration-emission identity check.
