# WSL framework comparison, September 18, 2026

This capture reruns the full framework comparison under WSL 2 using the last Windows capture’s workload plans and sample counts. The source is the uncommitted worktree based on 056b115478acb4a390ce750b26a4c066a2ff6a63. Source hashes and the worktree patch accompany the evidence. The unpublished package release target was subsequently renamed from 1.0.0 to 0.6.0 while retaining ABI epoch 2. Captured metadata remains unchanged.

The host is an AMD Ryzen 7 8745HS with 16 logical CPUs, running WSL 2 kernel
6.18.40.1-microsoft-standard-WSL2 with 12.6 GiB available memory, Node 26.9.0, Bun 1.4.2,
and Chromium 149.0.7827.55. The Windows capture used Node 26.8.1 and about 25.8 GiB memory.
All 3,178 captured implementation files remained unchanged through the rerun. The Nuxt Node
harness uses Nitro's public request listener with static-file serving, replacing imports of
private generated chunks that failed after rebuilding under Linux.

The production comparison covers five frameworks in the client and string SSR lanes. Streaming uses the three participants with an actual streaming renderer: eXact, React, and TanStack Start. Node and native Bun run separately. Sustained capacity uses eXact and React, two independent response-validating drivers, and two populations with reversed framework order.

Client timing retains 30 samples per framework, startup ten samples at each of 1x/4x/6x CPU, and heap composition five samples per framework. Captured-page replay stops framework servers before timing. SSR diagnostics retain 500 sequential samples and 500 burst waves. Sustained capacity uses the same plans as the September 18 Windows baseline.

## Windows-to-WSL sustained RPS

Same workload plans, total concurrency 32, two independent drivers, and two reversed-order populations. Rates divide total valid responses by the union of simultaneous driver spans, summed across both populations and including drain, matching the public charts. These differences also include runtime, source, and generated-artifact changes; they do not isolate WSL.

| Runtime/API | Loading   | Framework | Windows RPS | WSL RPS | Change |
| ----------- | --------- | --------- | ----------: | ------: | -----: |
| node/string | preloaded | exact     |       8,441 |  15,901 | +88.4% |
| node/string | preloaded | react     |       6,849 |  12,832 | +87.4% |
| node/string | normal    | exact     |       2,154 |   3,202 | +48.7% |
| node/string | normal    | react     |       2,021 |   2,625 | +29.9% |
| node/stream | preloaded | exact     |       6,770 |  10,824 | +59.9% |
| node/stream | preloaded | react     |       3,060 |   3,738 | +22.1% |
| node/stream | normal    | exact     |       2,092 |   3,487 | +66.6% |
| node/stream | normal    | react     |       1,525 |   2,278 | +49.4% |
| bun/string  | preloaded | exact     |       8,962 |  12,336 | +37.7% |
| bun/string  | preloaded | react     |       7,164 |  10,002 | +39.6% |
| bun/string  | normal    | exact     |       3,667 |   4,644 | +26.6% |
| bun/string  | normal    | react     |       3,665 |   4,808 | +31.2% |
| bun/stream  | preloaded | exact     |       5,047 |   7,787 | +54.3% |
| bun/stream  | preloaded | react     |       5,112 |   7,537 | +47.4% |
| bun/stream  | normal    | exact     |       3,566 |   4,403 | +23.5% |
| bun/stream  | normal    | react     |       3,618 |   4,524 | +25.0% |

## Client timing

Each cell is mean / p95 / p99. Lower is better. Historical differences on this shared PC do not isolate the effect of a code change.

| Metric                   | Unit |                    Exact |                    React |                SvelteKit |                     Nuxt |           TanStack Start |
| ------------------------ | ---- | -----------------------: | -----------------------: | -----------------------: | -----------------------: | -----------------------: |
| Navigation completion    | ms   | 28.280 / 30.800 / 31.000 | 41.687 / 45.200 / 47.900 | 27.620 / 30.700 / 32.500 | 40.167 / 43.300 / 44.700 | 62.127 / 67.300 / 67.800 |
| First contentful paint   | ms   | 57.467 / 64.000 / 64.000 | 60.400 / 72.000 / 76.000 | 44.933 / 52.000 / 52.000 | 48.667 / 60.000 / 60.000 | 58.133 / 64.000 / 64.000 |
| Optimistic feedback      | ms   |    2.437 / 3.300 / 4.200 |    2.293 / 3.800 / 3.900 |    1.933 / 2.500 / 2.500 |    1.657 / 2.000 / 2.800 |    2.307 / 3.300 / 3.500 |
| Authoritative settlement | ms   | 11.773 / 13.500 / 13.900 | 11.733 / 13.700 / 14.400 | 11.873 / 13.600 / 13.600 | 12.377 / 13.800 / 15.100 | 12.203 / 14.100 / 14.200 |
| Warm browser used heap   | MB   |    2.495 / 2.500 / 2.500 |    2.296 / 2.302 / 2.302 |    2.072 / 2.077 / 2.077 |    2.330 / 2.333 / 2.333 |    2.754 / 2.768 / 2.825 |

## Sustained SSR capacity

Total concurrency is 32. Each cell contains the two independent populations. RPS counts valid completed responses. Driver p99 is the largest of the two drivers in that population.

| Runtime | API    | Loading   | eXact valid RPS | React valid RPS |  eXact p99 ms |  React p99 ms |
| ------- | ------ | --------- | --------------: | --------------: | ------------: | ------------: |
| node    | string | preloaded | 14,555 / 17,248 | 12,610 / 13,056 |   5.40 / 4.79 |   6.56 / 8.67 |
| node    | string | normal    |   3,368 / 3,036 |   2,687 / 2,564 | 20.64 / 18.02 | 19.95 / 18.26 |
| node    | stream | preloaded | 10,421 / 11,229 |   3,722 / 3,754 |  12.76 / 6.59 | 18.46 / 18.42 |
| node    | stream | normal    |   3,405 / 3,568 |   2,283 / 2,274 | 22.91 / 21.60 | 32.54 / 32.45 |
| bun     | string | preloaded | 12,336 / 12,336 | 10,004 / 10,001 | 10.95 / 11.10 |   7.47 / 7.56 |
| bun     | string | normal    |   4,990 / 4,298 |   4,802 / 4,815 | 13.39 / 15.50 | 13.53 / 13.38 |
| bun     | stream | preloaded |   7,980 / 7,594 |   7,534 / 7,541 | 10.06 / 11.00 | 10.22 / 10.81 |
| bun     | stream | normal    |   4,420 / 4,387 |   4,555 / 4,493 | 18.98 / 18.48 | 17.41 / 18.26 |

## Offered load

Abrupt offered-load stages retain connection-growth pressure. Missed arrivals and request errors are included, including warmup errors in the total. No connection-preparation control replaces the primary results.

| Runtime/API | Framework | Offered RPS | Valid RPS, two populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | -------------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |              7,999 / 7,999 |              0 |               6 |
| node/string | exact     |      10,000 |              9,898 / 9,890 |              0 |            4217 |
| node/string | react     |       8,000 |              7,798 / 7,962 |             10 |            3891 |
| node/string | react     |      10,000 |              8,515 / 8,430 |              0 |           59934 |
| node/stream | exact     |       8,000 |              7,961 / 7,963 |              0 |            1503 |
| node/stream | exact     |      10,000 |              9,824 / 9,831 |              0 |            6855 |
| node/stream | react     |       8,000 |              4,330 / 4,370 |            627 |          143626 |
| node/stream | react     |      10,000 |              4,434 / 4,495 |            404 |          219960 |
| bun/string  | exact     |       8,000 |              7,999 / 7,999 |              0 |               5 |
| bun/string  | exact     |      10,000 |              9,970 / 9,975 |              0 |             660 |
| bun/string  | react     |       8,000 |              7,999 / 7,998 |              0 |              11 |
| bun/string  | react     |      10,000 |              8,914 / 8,955 |              0 |           41431 |
| bun/stream  | exact     |       8,000 |              6,754 / 6,636 |              0 |           51282 |
| bun/stream  | exact     |      10,000 |              6,744 / 6,656 |              0 |          131095 |
| bun/stream  | react     |       8,000 |              7,022 / 7,070 |              0 |           37120 |
| bun/stream  | react     |      10,000 |              7,333 / 7,155 |              0 |          109175 |

Total capacity request errors: 1041. Invalid responses: 0. Error categories are retained in the raw driver results.

## SSR completion tails

The burst metric measures completion of a 16-request wave, including data loading. Values are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |            SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | -------------------: | --------------------: | --------------------: |
| node/string | 6.80 / 10.22 / 13.32 |  6.07 / 8.99 / 13.81 | 9.94 / 14.40 / 25.97 | 13.54 / 20.63 / 25.56 | 11.62 / 17.48 / 28.77 |
| bun/string  |   4.94 / 6.45 / 8.60 |   4.97 / 6.70 / 8.70 |  5.35 / 7.14 / 12.86 |  7.20 / 11.02 / 16.14 |  6.48 / 10.43 / 14.83 |
| node/stream | 6.61 / 10.24 / 16.67 | 7.76 / 10.92 / 16.12 |          unavailable |           unavailable | 12.00 / 17.82 / 28.33 |
| bun/stream  |  4.90 / 6.59 / 10.51 |   5.04 / 6.66 / 9.12 |          unavailable |           unavailable |  7.84 / 12.73 / 19.00 |

## Historical comparison

The previous docs charts describe the [September 18 Windows capture](enhancement-framework-2026-09-18.md). This WSL capture uses the same CPU, but Node changed from 26.8.1 to 26.9.0, available memory changed, and source hashes and generated artifacts differ. Bun remains 1.4.2, with platform-specific connection settings. The differences do not isolate an operating-system effect.

| eXact browser metric     | Previous mean | Current mean | Change |
| ------------------------ | ------------: | -----------: | -----: |
| Navigation completion    |        30.670 |       28.280 |  -7.8% |
| First contentful paint   |        46.133 |       57.467 |  24.6% |
| Optimistic feedback      |         2.167 |        2.437 |  12.5% |
| Authoritative settlement |        13.030 |       11.773 |  -9.6% |
| Warm browser used heap   |         2.532 |        2.495 |  -1.5% |

## Production client size

The controlled eXact participant’s complete production client artifacts changed from 70,778 to 63,508 gzip bytes (-10.3%). Raw bytes changed from 229,856 to 207,065. This is a production-minified application measurement; it is distinct from the unminified dedicated enhancement fixture.

## Validation and evidence

Production Node and Bun targets passed 35 string-rendering browser contracts each and 21 streaming contracts each before measurement. Response identity, artifact identity, and load accounting are checked by the capture and publication tools. Error counts and missed arrivals remain visible.

Documentation type checking, the production build, all ten documentation tests, and focused lint passed. Browser verification checked all 17 distribution tables, five heap rows, and four sustained-capacity groups on desktop and mobile, including their displayed values. Neither viewport had page errors or horizontal overflow. The comparison harness also passed its 90 unit tests.

The [evidence archive](wsl-framework-2026-09-18-evidence.zip) includes the source patch, untracked
implementation files, exact runners, plans, and validation logs. The
[structured capture](wsl-framework-2026-09-18.json) retains raw source links, artifact hashes, source state, execution journal, runner source, and previous chart values. The public charts are generated from these measurements.

The [September 18 Windows capture](enhancement-framework-2026-09-18.md) remains historical evidence. This is a framework benchmark refresh, not a new full release-validation run.

## Native full stack

The separate native capture passed all eight acceptance tests and retained seven browser samples per participant. Its SSR and mutation results are in [wsl-framework-2026-09-18-native.json](wsl-framework-2026-09-18-native.json). Native and controlled-service results remain separate.

## Five-framework diagnostic RPS

These string-SSR diagnostic captures both use one 1,000 ms c32 window after the same 500-request and 500-burst populations. One window is weak evidence of steady-state capacity; use the independent-driver results above for the eXact/React throughput comparison.

| Framework      | Node Windows RPS | Node WSL RPS |  Change | Bun Windows RPS | Bun WSL RPS | Change |
| -------------- | ---------------: | -----------: | ------: | --------------: | ----------: | -----: |
| exact          |            1,539 |        3,287 | +113.6% |           3,718 |       3,200 | -13.9% |
| react          |            1,800 |        3,238 |  +79.9% |           4,057 |       3,136 | -22.7% |
| sveltekit      |            1,192 |        1,845 |  +54.8% |           3,981 |       3,282 | -17.6% |
| nuxt           |              908 |        1,330 |  +46.5% |           2,629 |       2,442 |  -7.1% |
| tanstack-start |              981 |        1,507 |  +53.5% |           3,420 |       2,789 | -18.5% |
