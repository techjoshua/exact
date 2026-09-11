# SSR completion baseline, September 11, 2026

This capture uses the final initial-release implementation: one rendering engine, separate
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

| Runtime | API    | Loading   |     eXact RPS |     React RPS | eXact driver p99 ms | React driver p99 ms |
| ------- | ------ | --------- | ------------: | ------------: | ------------------- | ------------------- |
| Node    | string | preloaded | 8,730 / 9,040 | 7,025 / 7,223 | 7.4 to 7.9          | 7.2 to 13.4         |
| Node    | string | normal    | 2,631 / 2,571 | 2,731 / 2,793 | 16.4 to 17.2        | 16.0 to 16.4        |
| Node    | stream | preloaded | 9,385 / 9,565 | 3,952 / 4,017 | 6.4 to 7.0          | 10.5 to 10.8        |
| Node    | stream | normal    | 2,323 / 2,392 | 2,000 / 1,947 | 17.7 to 18.8        | 20.5 to 21.6        |
| Bun     | string | preloaded | 8,537 / 8,542 | 8,805 / 8,499 | 5.4 to 11.0         | 5.2 to 5.6          |
| Bun     | string | normal    | 4,183 / 4,240 | 4,359 / 4,290 | 9.4 to 9.8          | 8.8 to 9.0          |
| Bun     | stream | preloaded | 6,012 / 5,960 | 5,947 / 6,088 | 7.8 to 8.4          | 7.2 to 12.6         |
| Bun     | stream | normal    | 4,241 / 4,258 | 4,333 / 4,308 | 9.9 to 10.4         | 9.4 to 9.6          |

## Scheduled demand

Misses are requests the load generator could not start on schedule, distinct from response errors.
The public charts retain each runtime, API, offered rate, valid RPS, misses, errors, and response tails.

| Runtime/API | Framework | Offered RPS | Valid RPS, two populations | Errors | Missed arrivals |
| ----------- | --------- | ----------: | -------------------------: | -----: | --------------: |
| Node string | eXact     |       8,000 |              7,868 / 7,804 |      0 |           5,970 |
| Node string | eXact     |      10,000 |              9,367 / 9,384 |      0 |          24,887 |
| Node string | React     |       8,000 |              7,929 / 7,901 |      0 |           2,738 |
| Node string | React     |      10,000 |              8,054 / 8,158 |      0 |          74,751 |
| Node stream | eXact     |       8,000 |              7,345 / 7,313 |    386 |          26,389 |
| Node stream | eXact     |      10,000 |              8,770 / 8,709 |      0 |          50,056 |
| Node stream | React     |       8,000 |              3,885 / 3,927 |  2,298 |         160,508 |
| Node stream | React     |      10,000 |              3,974 / 3,949 |      0 |         240,591 |
| Bun string  | eXact     |       8,000 |              7,640 / 7,739 |      0 |          11,428 |
| Bun string  | eXact     |      10,000 |              7,603 / 7,732 |      0 |          92,398 |
| Bun string  | React     |       8,000 |              7,730 / 7,694 |      0 |          10,546 |
| Bun string  | React     |      10,000 |              7,688 / 7,610 |      0 |          93,063 |
| Bun stream  | eXact     |       8,000 |              5,957 / 6,015 |      0 |          79,619 |
| Bun stream  | eXact     |      10,000 |              5,983 / 6,031 |      0 |         158,781 |
| Bun stream  | React     |       8,000 |              6,114 / 6,109 |      0 |          74,540 |
| Bun stream  | React     |      10,000 |              6,133 / 6,091 |      0 |         154,545 |

The capacity captures recorded 0 invalid responses and 2,684 request errors.
Error categories: {"ECONNREFUSED": 2684}

Connection refusals, where recorded, occurred while establishing connections. They are retained
as request failures, not attributed to malformed renderer output. These captures alone do not
establish whether the connection failures originate in host scheduling, networking limits, or
another transport condition. No failed stage is replaced merely to obtain a cleaner chart.

## Browser and validation

Final validation passed 2,102 package tests (11 skipped), 88 benchmark-harness tests, test and docs
type checks, 10 docs tests, and desktop/mobile verification of the published performance tables.

The full client capture includes 30 balanced browser rounds, startup at 1x/4x/6x CPU, five heap
samples per framework, and the root framework benchmarks. Client tests use common in-memory replay
delivery with framework servers stopped. Their unchanged client artifact hashes are verified against
the final build. All 112 live Node/Bun string/stream browser checks passed after automatic admission
integration. SSR diagnostics were refreshed for both APIs after the final adapter build.

The [automatic admission investigation](adaptive-default-node-2026-09-11.md) explains why lag alone
and server handler duration were rejected as decision signals. Client p99 is not guaranteed to
improve universally. The [shell/body investigation](ssr-shell-body-2026-09-11.md) records the
8192-byte decision, rejected 2048-byte trials, and browser proof of early CSS discovery.

[Full structured capture](ssr-completion-2026-09-11.json) contains source hashes, raw capture links,
execution journals, all public reports, and benchmark runners. The
[adaptive evidence archive](adaptive-default-node-2026-09-11-evidence.zip) retains rejected candidates,
workload-transition traces, measured source snapshots, validation logs, and before-default captures.
Earlier interrupted diagnostics are labeled as such and are excluded from these final results.

Two Node streaming demand attempts lost telemetry requests. The control client had explicitly
closed its connection after every poll, forcing new connections against the saturated listener.
The harness now reuses that private connection and retains its timeout and failure checks.
Only the paired Node streaming demand capture was repeated with this diagnostic transport fix;
application handlers, load generation, and response validation are unchanged. Other captures use
the earlier close-after-poll control policy. Each framework in a paired capture uses the same policy.
Rejected captures, including connection-refusal errors, remain in the evidence archive under
`telemetry-incomplete-node-stream-arrivals*`. All attempts remain in the execution journal.
