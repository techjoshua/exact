# Fixed-concurrency SSR refresh — September 7, 2026

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

This capture refreshes the public preloaded concurrency sweep using the current workspace
build. The framework and eXact/React benchmark targets were rebuilt before measurement;
all 14 shared eXact/React correctness checks passed. No builds, tests, or profilers ran
alongside the timed sweep.

The existing plan is unchanged: two independent drivers, 10 seconds of discarded warmup,
then 15 seconds each at total concurrency 16, 32, 64, and 128. Two fresh populations use
eXact/React and React/eXact order. Each fixed-concurrency loop waits for its response before
issuing another request. Data is preloaded, but each request still renders and transfers HTML
over HTTP. RPS aggregates valid responses over simultaneous driver spans, including drain.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------: | --------------: | --------------: |
|                16 |           7,080 |           6,808 |
|                32 |           7,032 |           6,994 |
|                64 |           6,788 |           6,630 |
|               128 |           6,451 |           6,367 |

All stages, including warmup, completed with zero request errors. Response identities,
accounting, population order, and host/runtime metadata were validated. The best measured
points are eXact at concurrency 16 and React at concurrency 32. Individual populations vary;
these observations do not establish a causal performance change from the earlier capture.

The public concurrency curve and its headline now use this capture. The headline explicitly
identifies a fixed-concurrency result, rather than suggesting an overall maximum across load
patterns. Scheduled-arrival and normal-loading rows retain their separate capture dates and
builds; browser and other server metrics are unchanged. The current sweep includes the Node
adapter logging changes added during the earlier error investigation. No assertion of identical
artifacts across the independently dated lanes is made by this partial refresh.

Raw capture, artifact identities, telemetry, error diagnostics, and runner source (local capture: `concurrency-refresh-2026-09-07.json`).
The existing strict summarizer validates the new sweep; historical captures remain unchanged.

Publication validation passed: three capacity-report tests, targeted lint, docs type checking
and production build, and desktop/mobile checks of all capacity tables and the headline against
the published JSON. Browser/heap and other server chart values were also checked against their
unchanged data. The documentation changes are local, not deployed.
