# Full benchmarks after child normalization, September 11, 2026

This capture includes the retained child-normalization optimization: one rendering engine, separate
application hydration and document-shell ownership, incremental 8192-byte streaming, compiler-proven
static heads before blocking tasks, and automatic adaptive Node admission. Native Bun retains
immediate admission. React uses its unchanged framework renderer and runtime transport. Both
frameworks render their complete authored application and document shell for every request.

Production Node 26.8.1 and Bun 1.4.2 ran locally on the same PC with variable foreground usage.
Two independent load generators validate complete response hashes. Each population reverses
framework order. Values below are the two populations, not a comparison with an earlier idle PC run.
String and stream APIs are separate. No response coalescing or cached rendered documents are used.

## Sustained capacity

Preloaded capacity isolates rendering and HTTP response delivery; normal loading includes fetching
the application data. Both rows use total concurrency 32. RPS is valid completed responses per second.

| Runtime | API    | Loading   |       eXact RPS |     React RPS | eXact driver p99 ms | React driver p99 ms |
| ------- | ------ | --------- | --------------: | ------------: | ------------------- | ------------------- |
| Node    | string | preloaded | 11,746 / 12,309 | 9,857 / 9,701 | 4.4 to 10.7         | 4.2 to 11.3         |
| Node    | string | normal    |   2,582 / 2,577 | 2,713 / 2,881 | 16.8 to 17.5        | 15.7 to 16.7        |
| Node    | stream | preloaded |   9,592 / 8,891 | 3,922 / 3,992 | 6.2 to 6.6          | 10.2 to 11.0        |
| Node    | stream | normal    |   2,411 / 2,407 | 1,977 / 2,018 | 17.5 to 18.2        | 20.3 to 21.7        |
| Bun     | string | preloaded |   8,524 / 8,558 | 8,814 / 8,861 | 5.5 to 10.4         | 5.3 to 11.0         |
| Bun     | string | normal    |   4,370 / 4,271 | 4,289 / 4,345 | 9.0 to 9.9          | 8.9 to 9.0          |
| Bun     | stream | preloaded |   5,969 / 5,823 | 6,226 / 6,235 | 7.7 to 8.2          | 7.0 to 7.3          |
| Bun     | stream | normal    |   4,139 / 4,214 | 4,296 / 4,180 | 9.9 to 10.9         | 9.4 to 9.8          |

## Scheduled demand

Misses are requests the load generator could not start on schedule, distinct from response errors.
The public charts retain each runtime, API, offered rate, valid RPS, misses, errors, and response tails.

| Runtime/API | Framework | Offered RPS | Valid RPS, two populations | Errors | Missed arrivals |
| ----------- | --------- | ----------: | -------------------------: | -----: | --------------: |
| Node string | eXact     |       8,000 |              7,860 / 7,854 |     26 |           5,611 |
| Node string | eXact     |      10,000 |              9,407 / 9,206 |      0 |          27,709 |
| Node string | React     |       8,000 |              7,965 / 7,988 |      4 |             845 |
| Node string | React     |      10,000 |              7,998 / 8,054 |      0 |          77,979 |
| Node stream | eXact     |       8,000 |              7,350 / 7,299 |    339 |          26,398 |
| Node stream | eXact     |      10,000 |              8,760 / 8,703 |      0 |          50,705 |
| Node stream | React     |       8,000 |              3,906 / 3,918 |  2,020 |         160,552 |
| Node stream | React     |      10,000 |              3,976 / 3,970 |      0 |         240,115 |
| Bun string  | eXact     |       8,000 |              7,735 / 7,643 |      0 |          11,495 |
| Bun string  | eXact     |      10,000 |              7,618 / 7,596 |      0 |          94,749 |
| Bun string  | React     |       8,000 |              7,770 / 7,738 |      0 |           8,858 |
| Bun string  | React     |      10,000 |              7,688 / 7,727 |      0 |          90,695 |
| Bun stream  | eXact     |       8,000 |              5,923 / 6,013 |      0 |          80,308 |
| Bun stream  | eXact     |      10,000 |              6,061 / 5,895 |      0 |         159,875 |
| Bun stream  | React     |       8,000 |              6,085 / 6,242 |      0 |          72,507 |
| Bun stream  | React     |      10,000 |              6,159 / 6,105 |      0 |         153,763 |

The capacity captures recorded 0 invalid responses and 2,389 request errors.
Error categories: {"ECONNREFUSED": 2359, "ECONNRESET": 30}

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
| Navigation completion    |     29.243 |     36.283 | ms   |
| First contentful paint   |     43.733 |     44.933 | ms   |
| Optimistic feedback      |      1.620 |      1.463 | ms   |
| Authoritative settlement |     14.110 |     13.787 | ms   |
| Warm browser used heap   |      2.498 |      2.303 | MB   |

## Retained change and evidence

The only retained runtime change is [child normalization](v8-attribute-and-child-normalization-2026-09-11.md):
nested children append into one owned result array instead of allocating and copying intermediate
arrays. Attribute-inlining and earlier validator/layout experiments remain rejected. The current
benchmark app has little nested-child work, so the focused normalization speedup is not presented
as an equivalent application throughput improvement.

The shared renderer, authored shell behavior, 8192-byte streaming buffer, hydration contracts, and
automatic Node admission are unchanged. Bun retains its existing immediate admission behavior.
No alternate renderer, cached response, request coalescing, or React optimization is introduced.

All 112 live Node/Bun string/stream browser checks passed before timing. Core and SSR tests, type
checking, compiled-artifact compatibility, and platform/package boundaries were validated for the
retained change. The final publication checks are recorded in the accompanying evidence.

[Full structured capture](v8-normalization-full-2026-09-11.json) preserves all source identities,
raw capture links, execution journal, client/SSR reports, and supplemental framework benchmarks.
All twelve capacity captures and both full SSR diagnostic modes use the same persistent telemetry
control transport. Build identity verification ensures the published measurements match the
retained application artifacts.

Final validation passed 2,106 package tests (11 skipped), 88 benchmark-harness tests, test and docs
type checking, 10 docs tests, the production docs build, and desktop/mobile verification of all
17 distribution tables, heap rows, and capacity tables. No task-owned runtime or compiler processes
remained after validation.

[Full-run evidence archive](v8-normalization-full-2026-09-11-evidence.zip) includes measured bundles,
source snapshots, runners, raw results, execution and validation logs, and documentation screenshots.

Archive SHA-256: `5bb88e5b699b975574d3343aa3a04e28e9f84984d8bbfbeaacb429cfb5c8d462`.
