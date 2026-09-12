# Production SSR readiness checkpoints, September 12, 2026

The Node and native Bun adapters now carry their host-owned adaptive policy through request
cancellation scopes. SSR consults it at render entry and after pending component props or blocking
tasks settle. Ready work remains synchronous; transport backpressure does not add checkpoints.
The runtime rechecks task readiness after queued admission so a new generation cannot publish
unsettled output. Existing compiler continuations and the single rendering engine remain in use.

Measured working tree based on commit `4470d8d008114469555421cbac4eaf957efd6f46`. Changed packages and all three eXact comparison
outputs were rebuilt. The measured runtime source and bundles were frozen before measurement,
while the implementation was uncommitted; source hashes and the parent commit are retained.
React and the other participants retain their existing implementations. Production Node 26.8.1
and Bun 1.4.2 ran on the shared Windows PC with variable foreground usage. Every response renders
the complete authored document and application. No response or component execution is shared.

Two independent load drivers validate complete response hashes. Both fresh populations are retained,
with framework order reversed in the second population. Rates count valid completed responses.
Older captures are historical context, not idle-PC controls.

## Sustained capacity

Preloaded capacity isolates rendering and HTTP delivery; normal loading includes fetching application data.
Both modes below use total concurrency 32. RPS counts valid completed responses. Tail ranges span drivers
and both populations.

| Runtime | API    | Loading   |       eXact RPS |      React RPS | eXact driver p99 ms | React driver p99 ms |
| ------- | ------ | --------- | --------------: | -------------: | ------------------- | ------------------- |
| Node    | string | preloaded | 12,846 / 12,971 | 10,022 / 9,633 | 4.1 to 10.3         | 4.2 to 11.5         |
| Node    | string | normal    |   3,477 / 3,276 |  2,811 / 2,780 | 14.6 to 15.2        | 15.5 to 15.9        |
| Node    | stream | preloaded | 10,126 / 10,020 |  3,933 / 3,949 | 5.7 to 11.2         | 10.6 to 10.9        |
| Node    | stream | normal    |   3,079 / 3,078 |  1,960 / 2,042 | 15.6 to 16.2        | 20.7 to 21.7        |
| Bun     | string | preloaded | 11,379 / 11,176 |  8,850 / 8,772 | 4.8 to 10.1         | 5.2 to 5.6          |
| Bun     | string | normal    |   4,307 / 4,316 |  4,342 / 4,385 | 9.4 to 9.9          | 8.9 to 10.6         |
| Bun     | stream | preloaded |   6,456 / 6,465 |  6,202 / 6,304 | 7.9 to 8.0          | 6.9 to 7.1          |
| Bun     | stream | normal    |   4,195 / 4,254 |  4,372 / 4,320 | 10.2 to 10.8        | 9.4 to 9.7          |

## Scheduled demand

Misses are requests the load generator could not start on schedule, distinct from response errors.
The public charts retain each runtime, API, offered rate, valid RPS, misses, errors, and response tails.
Missed arrivals below include capacity, driver-lag, and end-of-stage misses across both populations.
The capacity-only subset is shown separately; p99 ranges span individual drivers and populations.

| Runtime/API | Framework | Offered RPS | Valid RPS, two populations | Errors | Missed arrivals | Capacity misses | Driver p99 ms  |
| ----------- | --------- | ----------: | -------------------------: | -----: | --------------: | --------------: | -------------- |
| Node string | eXact     |       8,000 |              7,988 / 7,995 |     86 |             228 |             217 | 47.7 to 53.1   |
| Node string | eXact     |      10,000 |              9,894 / 9,887 |      0 |           4,261 |           4,249 | 67.6 to 68.4   |
| Node string | React     |       8,000 |              7,989 / 7,994 |      0 |             156 |             148 | 59.5 to 61.4   |
| Node string | React     |      10,000 |              8,090 / 8,116 |      0 |          74,895 |          74,878 | 82.2 to 83.5   |
| Node stream | eXact     |       8,000 |              7,904 / 7,913 |      0 |           3,541 |           3,521 | 85.0 to 85.4   |
| Node stream | eXact     |      10,000 |              9,468 / 9,728 |      0 |          15,456 |          15,430 | 87.3 to 89.0   |
| Node stream | React     |       8,000 |              3,923 / 3,919 |  2,552 |         159,655 |         159,651 | 136.6 to 137.1 |
| Node stream | React     |      10,000 |              3,929 / 3,921 |      0 |         242,030 |         242,011 | 135.0 to 138.1 |
| Bun string  | eXact     |       8,000 |              7,995 / 7,995 |      0 |              47 |              33 | 26.8 to 47.4   |
| Bun string  | eXact     |      10,000 |              9,906 / 9,906 |      0 |           3,631 |           3,596 | 66.1 to 68.0   |
| Bun string  | React     |       8,000 |              7,899 / 7,756 |      0 |           5,921 |           5,913 | 68.4 to 70.5   |
| Bun string  | React     |      10,000 |              7,788 / 7,654 |      0 |          90,227 |          90,220 | 69.5 to 72.6   |
| Bun stream  | eXact     |       8,000 |              6,032 / 5,990 |      0 |          78,590 |          78,572 | 90.9 to 98.2   |
| Bun stream  | eXact     |      10,000 |              6,062 / 5,973 |      0 |         158,328 |         158,310 | 91.3 to 91.9   |
| Bun stream  | React     |       8,000 |              6,214 / 6,169 |      0 |          71,395 |          71,375 | 86.9 to 88.6   |
| Bun stream  | React     |      10,000 |              6,236 / 6,166 |      0 |         151,009 |         150,995 | 86.1 to 88.7   |

### Request-error categories

| Capture              | Framework | Population | Stage               | Error counts        |
| -------------------- | --------- | ---------: | ------------------- | ------------------- |
| node-arrivals        | exact     |          1 | total-arrivals-8000 | ECONNREFUSED: 75    |
| node-arrivals        | exact     |          2 | total-arrivals-8000 | ECONNRESET: 11      |
| node-stream-arrivals | react     |          1 | total-arrivals-8000 | ECONNREFUSED: 1,266 |
| node-stream-arrivals | react     |          2 | total-arrivals-8000 | ECONNREFUSED: 1,286 |

The capacity captures recorded 0 invalid responses and 2,638 request errors.
Warmup stages, excluded from measured rates, recorded 0 additional request errors.
Error categories: {"ECONNREFUSED": 2627, "ECONNRESET": 11}

Missed arrivals and request errors remain visible in the published data. They are not removed
to obtain a clean chart. These results reflect this PC during the capture; differences from older
idle-PC runs are not attributed to the code change.

## Focused checkpoint controls

These controls retain the adapters' original admission policy and disable only the added SSR
checkpoint with an explicit immediate render hook. Each setting has two fresh populations, with
framework order reversed in the second. The on captures precede the off captures, so small
differences cannot separate policy cost from changing foreground load.

| Workload                                 | Checkpoint    | Framework | Valid RPS, two populations | Errors | Missed arrivals | Driver p99 ms  |
| ---------------------------------------- | ------------- | --------- | -------------------------: | -----: | --------------: | -------------- |
| Node preloaded string, 8,000 offered RPS | on            | eXact     |              7,996 / 7,985 |      0 |             319 | 41.92 to 52.32 |
| Node preloaded string, 8,000 offered RPS | React control | React     |              7,999 / 7,990 |      0 |             151 | 40.13 to 63.77 |
| Node preloaded string, 8,000 offered RPS | off           | eXact     |              7,998 / 7,998 |      0 |              21 | 40.67 to 45.70 |
| Node preloaded string, 8,000 offered RPS | React control | React     |              7,994 / 7,994 |     36 |               6 | 35.17 to 52.61 |
| Bun normal stream, concurrency 32        | on            | eXact     |              4,207 / 4,223 |      0 |               0 | 10.52 to 10.78 |
| Bun normal stream, concurrency 32        | React control | React     |              4,278 / 4,289 |      0 |               0 | 9.45 to 9.75   |
| Bun normal stream, concurrency 32        | off           | eXact     |              4,211 / 4,186 |      0 |               0 | 10.13 to 10.29 |
| Bun normal stream, concurrency 32        | React control | React     |              4,290 / 4,292 |      0 |               0 | 9.41 to 9.71   |

Bun normal streaming still favors React with the checkpoint disabled. These controls do not
establish the checkpoint as the cause of that gap. Node eXact controls had zero request errors
with either setting. React recorded 36 ECONNRESET errors in the second checkpoint-off control
population. The original Node connection failures remain unexplained; this repeat does not
establish the checkpoint as their cause. Tail-latency results are mixed.

The Node control targets the original string-lane errors. It is not a checkpoint-off repeat of
the React streaming overload failures, and does not explain those failures.

## Interpretation

The current full capture favors eXact in Node string and streaming throughput, and in Bun preloaded
string and streaming throughput. Bun normal string and streaming loading still favor React. Bun
streaming also trails React under offered load, with more missed arrivals. A preloaded throughput
lead does not establish a normal-loading or tail-latency lead. The full eXact/React sweep compares
frameworks; only the focused on/off controls isolate the added checkpoint, within their run-order
and shared-host limitations. No universal checkpoint speedup is claimed.

## Scope and verification

The full sweep completed all 16 stages: 112 live Node/Bun string/stream browser correctness checks, twelve
capacity captures, both full SSR diagnostic API modes, and the server performance suite.
Capacity uses ten-second warmups, fifteen-second concurrency stages, twenty-second normal-loading
stages, and twenty-second offered-load stages. Both populations are retained. SSR diagnostics use
500 sequential samples and 500 concurrency waves per supported framework and runtime.

The existing client capture remains the source of browser timing,
startup, and heap charts. Those measurements were not rerun or assigned the new SSR capture date.
The public documentation charts are refreshed only for SSR.

The [structured capture](ssr-production-checkpoint-2026-09-12.json) preserves raw-source identities, capacity
summaries, execution commands and exit statuses, validation evidence, and unchanged historical
browser metadata. Per-driver tails are ranges, not averaged or pooled percentiles.

An initial preloaded capture was interrupted to tighten readiness rechecking before this sweep.
It is retained separately and excluded from the final measurements.

The final checks passed: 677 package tests, 11 native Bun integration tests, 88 benchmark harness
tests, 112 build-script tests, and 10 documentation tests. The five scheduler fixture tests were
rerun after replacing ES2024-only test helpers with ordinary promises to match the ES2022 test
configuration. Package and test types, package contents, platform boundaries, compiled ABI,
source architecture, JSDoc, explicit-any limits, and changed-file lint checks passed.
Documentation type checking and the production build passed. Desktop and mobile browser checks
verified chart values against the published data, with no page errors or horizontal overflow.

The [verification journal](ssr-production-checkpoint-2026-09-12-verification.json) records the
initial test-type failure and successful repeat. Test listener/plugin warnings and the docs build's
large-chunk advisory were retained. The [evidence archive](ssr-production-checkpoint-2026-09-12-evidence.zip)
preserves measured source files and bundles, plans, runners, logs, screenshots, and the interrupted
capture excluded from the final measurements. The structured capture links and hashes every raw
capacity, diagnostic, and checkpoint-control capture. Source provenance identifies the measured
uncommitted working tree by its file hashes and parent commit, without claiming the parent alone
contains the implementation.
