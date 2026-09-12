# Full benchmarks after client reconciliation work, September 11, 2026

This capture includes the retained [client allocation improvements](client-v8-optimization-2026-09-11.md)
and [keyed reconciliation correction](client-reconciliation-2026-09-11.md). All workspace packages and
comparison applications were rebuilt before measurement. The measured source commit is `dc89530c0c92a2347d66bac287440eccfd6ee4d0`.

Production Node 26.8.1 and Bun 1.4.2 ran on the same shared PC with variable foreground usage.
Each framework renders its own complete application and document shell. String and stream APIs
are reported separately. Node uses automatic adaptive admission; Bun retains immediate admission.
No response coalescing or cached rendered documents are used in SSR measurements.

Two independent load generators validate complete response hashes. The second population reverses
framework order. Results compare frameworks measured in this capture, not against an older idle-PC run.
Unrelated untracked output directories account for the dirty-workspace flag; tracked source was unchanged.
Frozen server bundles and client artifact hashes are verified before report publication.

## Sustained capacity

Preloaded capacity isolates rendering and HTTP delivery; normal loading includes fetching application data.
Both modes below use total concurrency 32. RPS counts valid completed responses. Tail ranges span drivers
and both populations.

| Runtime | API    | Loading   |       eXact RPS |     React RPS | eXact driver p99 ms | React driver p99 ms |
| ------- | ------ | --------- | --------------: | ------------: | ------------------- | ------------------- |
| Node    | string | preloaded | 13,039 / 13,597 | 9,797 / 8,791 | 4.6 to 10.0         | 4.3 to 4.9          |
| Node    | string | normal    |   2,574 / 2,586 | 2,702 / 2,743 | 16.5 to 17.1        | 15.5 to 16.8        |
| Node    | stream | preloaded | 11,006 / 10,828 | 3,962 / 3,991 | 5.7 to 10.7         | 10.4 to 10.7        |
| Node    | stream | normal    |   2,355 / 2,378 | 1,994 / 2,002 | 17.8 to 18.4        | 20.4 to 21.4        |
| Bun     | string | preloaded |   8,633 / 8,550 | 8,726 / 8,853 | 5.4 to 5.6          | 5.2 to 10.9         |
| Bun     | string | normal    |   4,347 / 4,334 | 4,363 / 4,364 | 8.9 to 9.0          | 8.9 to 12.4         |
| Bun     | stream | preloaded |   5,989 / 6,117 | 6,308 / 6,250 | 7.6 to 11.0         | 6.8 to 11.8         |
| Bun     | stream | normal    |   4,258 / 4,268 | 4,332 / 4,342 | 9.7 to 10.2         | 9.4 to 9.5          |

## Scheduled demand

Misses are requests the load generator could not start on schedule, distinct from response errors.
The public charts retain each runtime, API, offered rate, valid RPS, misses, errors, and response tails.
Missed arrivals below include capacity, driver-lag, and end-of-stage misses across both populations.
The capacity-only subset is shown separately; p99 ranges span individual drivers and populations.

| Runtime/API | Framework | Offered RPS | Valid RPS, two populations | Errors | Missed arrivals | Capacity misses | Driver p99 ms  |
| ----------- | --------- | ----------: | -------------------------: | -----: | --------------: | --------------: | -------------- |
| Node string | eXact     |       8,000 |              7,987 / 7,999 |      5 |             187 |             141 | 47.6 to 48.3   |
| Node string | eXact     |      10,000 |              9,899 / 9,885 |      0 |           4,238 |           4,223 | 68.1 to 68.5   |
| Node string | React     |       8,000 |              7,996 / 7,959 |      0 |             377 |             370 | 45.3 to 63.9   |
| Node string | React     |      10,000 |              7,891 / 8,040 |      0 |          80,410 |          80,392 | 79.4 to 86.6   |
| Node stream | eXact     |       8,000 |              7,922 / 7,909 |    155 |           3,191 |           3,179 | 80.7 to 84.0   |
| Node stream | eXact     |      10,000 |              9,826 / 9,798 |     13 |           7,433 |           7,420 | 83.8 to 84.5   |
| Node stream | React     |       8,000 |              3,947 / 3,872 |  2,161 |         160,507 |         160,483 | 140.5 to 140.9 |
| Node stream | React     |      10,000 |              3,931 / 3,948 |      0 |         241,466 |         241,449 | 134.7 to 136.7 |
| Bun string  | eXact     |       8,000 |              7,734 / 7,715 |      0 |          10,022 |          10,005 | 70.1 to 70.3   |
| Bun string  | eXact     |      10,000 |              7,685 / 7,612 |      0 |          93,092 |          93,078 | 70.5 to 71.0   |
| Bun string  | React     |       8,000 |              7,752 / 7,779 |      0 |           8,395 |           8,372 | 69.5 to 72.7   |
| Bun string  | React     |      10,000 |              7,693 / 7,684 |      0 |          91,463 |          91,449 | 70.0 to 71.9   |
| Bun stream  | eXact     |       8,000 |              5,978 / 5,886 |      0 |          81,752 |          81,737 | 89.7 to 91.6   |
| Bun stream  | eXact     |      10,000 |              5,972 / 5,942 |      0 |         160,734 |         160,714 | 91.1 to 91.6   |
| Bun stream  | React     |       8,000 |              6,116 / 6,141 |      0 |          73,904 |          73,880 | 87.6 to 88.8   |
| Bun stream  | React     |      10,000 |              6,134 / 6,074 |      0 |         154,851 |         154,836 | 88.2 to 89.3   |

### Request-error categories

| Capture              | Framework | Population | Stage                | Error counts        |
| -------------------- | --------- | ---------: | -------------------- | ------------------- |
| node-arrivals        | exact     |          2 | total-arrivals-8000  | ECONNRESET: 5       |
| node-stream-arrivals | exact     |          1 | total-arrivals-8000  | ECONNREFUSED: 155   |
| node-stream-arrivals | react     |          1 | total-arrivals-8000  | ECONNREFUSED: 1,112 |
| node-stream-arrivals | react     |          2 | total-arrivals-8000  | ECONNREFUSED: 1,049 |
| node-stream-arrivals | exact     |          2 | total-arrivals-10000 | ECONNRESET: 13      |

The capacity captures recorded 0 invalid responses and 2,334 request errors.
Warmup stages, excluded from measured rates, recorded 0 additional request errors.
Error categories: {"ECONNREFUSED": 2316, "ECONNRESET": 18}

Missed arrivals and request errors remain visible in the published data. They are not removed
to obtain a clean chart. These results reflect this PC during the capture; differences from older
idle-PC runs are not attributed to the code change.

## Client measurements

All five frameworks use the common in-memory replay delivery path, with framework servers stopped
during client timing. The capture includes 30 balanced navigation/interaction rounds, startup at
1x/4x/6x CPU, and five heap samples per framework. Both eXact and React render their authored shells
before replay capture. These client measurements are separate from HTTP capacity.

| Client metric            | eXact mean | React mean | Unit |
| ------------------------ | ---------: | ---------: | ---- |
| Navigation completion    |     29.090 |     35.940 | ms   |
| First contentful paint   |     42.267 |     45.200 | ms   |
| Optimistic feedback      |      1.610 |      1.547 | ms   |
| Authoritative settlement |     13.823 |     13.583 | ms   |
| Warm browser used heap   |      2.494 |      2.303 | MB   |

### Startup under CPU throttling

Mean readiness and first contentful paint from the separate startup capture.

| CPU throttle | eXact ready ms | React ready ms | eXact FCP ms | React FCP ms |
| ------------ | -------------: | -------------: | -----------: | -----------: |
| 1x           |          61.64 |          66.35 |        41.20 |        47.60 |
| 4x           |         249.43 |         249.51 |       124.80 |       156.80 |
| 6x           |         413.30 |         394.20 |       179.20 |       170.40 |

## Scope and evidence

All 28 measurement stages completed: live browser correctness, five-framework browser experience,
startup CPU throttling, heap composition, twelve SSR capacity captures, both SSR diagnostic API modes,
and ten internal performance suites. The execution journal retains each command, environment, duration,
and exit status. All 112 live Node/Bun string/stream checks passed before timing.

The three-row incident application is not the 1,000-row replacement workload that exposed the recent
reconciliation improvement. The [focused scaling results](client-reconciliation-2026-09-11.md) remain
a separate experiment; this full suite must not inherit their claimed percentage improvement.

The public documentation reports were refreshed from these captures and checked against their source
data. Source identities, supplemental benchmarks, raw captures, and the execution journal are preserved
in the [full structured capture](client-full-2026-09-11.json). Historical comparisons inside that artifact
are context only, because foreground PC usage can vary.

Artifact checks, 88 harness tests, 10 documentation tests, documentation type checking and build,
and desktop/mobile chart-value checks passed. The [verification journal](client-full-2026-09-11-verification.json)
records the completed checks.
