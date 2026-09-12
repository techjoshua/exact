# Full benchmarks after Node admission changes, September 11, 2026

This capture includes the revised adaptive Node admission policy and retained child normalization.
The renderer uses separate application hydration and document-shell ownership, incremental
8192-byte streaming, and compiler-proven static heads before blocking tasks. Native Bun retains
immediate admission. React uses its unchanged framework renderer and runtime transport. Both
frameworks render their complete authored application and document shell for every request.

Production Node 26.8.1 and Bun 1.4.2 ran locally on the same PC with variable foreground usage.
Two independent load generators validate complete response hashes. The second population reverses
framework order. Values below are the two populations, not a comparison with an earlier idle PC run.
String and stream APIs are separate. No response coalescing or cached rendered documents are used.
The measured source commit is `9a98803a68772e57af44b4be39963a5baed03561`. The capture reports
a dirty workspace because unrelated untracked output directories were present; tracked source was
unchanged. Frozen measured bundles and client artifact hashes are verified before publication.

## Sustained capacity

Preloaded capacity isolates rendering and HTTP response delivery; normal loading includes fetching
the application data. Both loading modes use total concurrency 32. RPS is valid completed responses per second.

| Runtime | API    | Loading   |       eXact RPS |     React RPS | eXact driver p99 ms | React driver p99 ms |
| ------- | ------ | --------- | --------------: | ------------: | ------------------- | ------------------- |
| Node    | string | preloaded | 13,717 / 13,713 | 9,350 / 9,657 | 4.0 to 9.6          | 10.6 to 11.2        |
| Node    | string | normal    |   2,567 / 2,547 | 2,718 / 2,673 | 16.9 to 17.2        | 15.7 to 17.7        |
| Node    | stream | preloaded | 10,328 / 10,716 | 3,982 / 4,017 | 5.8 to 11.1         | 10.5 to 10.6        |
| Node    | stream | normal    |   2,343 / 2,350 | 2,018 / 2,006 | 18.0 to 18.5        | 20.8 to 21.3        |
| Bun     | string | preloaded |   8,507 / 8,626 | 8,789 / 9,048 | 5.6 to 11.1         | 4.9 to 5.0          |
| Bun     | string | normal    |   4,307 / 4,250 | 4,399 / 4,380 | 9.2 to 9.5          | 8.9 to 12.6         |
| Bun     | stream | preloaded |   5,948 / 5,923 | 6,288 / 6,246 | 7.8 to 8.3          | 7.1 to 11.9         |
| Bun     | stream | normal    |   4,275 / 4,212 | 4,245 / 4,318 | 9.8 to 10.1         | 9.5 to 10.9         |

## Scheduled demand

Misses are requests the load generator could not start on schedule, distinct from response errors.
The public charts retain each runtime, API, offered rate, valid RPS, misses, errors, and response tails.
Missed arrivals below include capacity, driver-lag, and end-of-stage misses across both populations.
The capacity-only subset is shown separately; p99 ranges span individual drivers and populations.

| Runtime/API | Framework | Offered RPS | Valid RPS, two populations | Errors | Missed arrivals | Capacity misses | Driver p99 ms  |
| ----------- | --------- | ----------: | -------------------------: | -----: | --------------: | --------------: | -------------- |
| Node string | eXact     |       8,000 |              8,000 / 7,905 |      0 |           1,875 |           1,865 | 33.8 to 73.3   |
| Node string | eXact     |      10,000 |              9,886 / 9,891 |      0 |           4,350 |           4,339 | 67.6 to 68.6   |
| Node string | React     |       8,000 |              7,982 / 7,909 |      0 |           1,623 |           1,572 | 65.0 to 76.5   |
| Node string | React     |      10,000 |              7,979 / 7,999 |      0 |          79,450 |          79,434 | 79.9 to 86.5   |
| Node stream | eXact     |       8,000 |              7,913 / 7,875 |      0 |           4,148 |           4,110 | 86.1 to 87.4   |
| Node stream | eXact     |      10,000 |              9,813 / 9,797 |     14 |           7,665 |           7,646 | 86.3 to 86.8   |
| Node stream | React     |       8,000 |              3,963 / 3,841 |  2,025 |         160,892 |         160,876 | 139.8 to 140.4 |
| Node stream | React     |      10,000 |              3,923 / 3,883 |      0 |         242,928 |         242,904 | 139.0 to 140.3 |
| Bun string  | eXact     |       8,000 |              7,646 / 7,668 |      0 |          12,696 |          12,676 | 70.5 to 71.2   |
| Bun string  | eXact     |      10,000 |              7,530 / 7,596 |      0 |          96,466 |          96,454 | 71.5 to 72.1   |
| Bun string  | React     |       8,000 |              7,633 / 7,818 |      0 |          10,016 |          10,009 | 69.0 to 71.4   |
| Bun string  | React     |      10,000 |              7,495 / 7,755 |      0 |          94,002 |          93,970 | 70.2 to 78.6   |
| Bun stream  | eXact     |       8,000 |              6,020 / 5,982 |      0 |          79,029 |          79,012 | 89.8 to 90.3   |
| Bun stream  | eXact     |      10,000 |              5,944 / 6,032 |      0 |         159,516 |         159,472 | 88.8 to 90.6   |
| Bun stream  | React     |       8,000 |              6,167 / 6,085 |      0 |          73,968 |          73,956 | 86.7 to 89.3   |
| Bun stream  | React     |      10,000 |              6,080 / 6,168 |      0 |         154,118 |         154,031 | 86.7 to 88.6   |

The capacity captures recorded 0 invalid responses and 2,039 request errors.
Error categories: {"ECONNREFUSED": 2025, "ECONNRESET": 14}

All request errors occurred in Node streaming scheduled-demand stages: React had 879 refusals in
the first 8k population and 1,146 in the second. eXact had 14 resets in the second 10k population.
No other capacity stage recorded request errors. Node string still had slightly more eXact missed
arrivals at 8k than React, and Bun still had more eXact misses at both offered rates in both modes.
The Node streaming results therefore do not establish that missed arrivals or connection failures
have been eliminated across the framework.

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
| Navigation completion    |     28.760 |     35.923 | ms   |
| First contentful paint   |     42.933 |     46.800 | ms   |
| Optimistic feedback      |      1.537 |      1.500 | ms   |
| Authoritative settlement |     13.980 |     13.630 | ms   |
| Warm browser used heap   |      2.498 |      2.303 | MB   |

## Retained change and evidence

The [Node admission changes](node-admission-misses-2026-09-11.md) shorten immediate-control
observations to 250 ms when at least 100 responses complete, while retaining up to 750 ms for
lower-volume observations. Scheduled trials and enabled observations remain 750 ms. Successful
policies are routinely rechecked after 30 seconds instead of 5 seconds. Early reassessment after
poor completion or lag, quiet-period cleanup, and cancellation remain in place. The controller
still requires improved completion capacity and lower lag against both surrounding controls.

The earlier [child-normalization improvement](v8-attribute-and-child-normalization-2026-09-11.md)
is retained. The shared renderer, authored shell behavior, 8192-byte streaming buffer, and
hydration contracts are unchanged. Bun retains its existing immediate admission behavior.
Each request independently renders its component tree and complete document. React rendering
and transport remain unchanged.

All 112 live Node/Bun string/stream browser checks passed before timing. Core and SSR tests, type
checking, compiled-artifact compatibility, and platform/package boundaries were validated for the
retained change. The final publication checks are recorded in the accompanying evidence.

[Full structured capture](admission-full-2026-09-11.json) preserves all source identities,
raw capture links, execution journal, client/SSR reports, and supplemental framework benchmarks.
All twelve capacity captures and both full SSR diagnostic modes use the same persistent telemetry
control transport. Build identity verification ensures the published measurements match the
retained application artifacts.

Final publication validation passed artifact identity checks, 88 benchmark-harness tests, docs type
checking, 10 docs tests, the production docs build, and desktop/mobile verification of all 17
distribution tables, heap rows, capacity tables, and the advanced scheduling description. A temporary
checker encoding error was corrected; the initial failure and successful verification are retained.
No task-owned Node, Bun, or compiler processes remained after validation.

[Full-run evidence archive](admission-full-2026-09-11-evidence.zip) includes measured bundles,
source snapshots, runners, raw results, execution and validation logs, and documentation screenshots.

Archive SHA-256: `acb07a22e73701eacc16307f5e2592735de37515891e2b81eaa51ecd09218eea`.
