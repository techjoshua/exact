# Processor placement during renderer invocation

Status: HTTP invocation remains slower on logical processors also used by isolated
loops. Placement alone does not explain the gap. Resource contention remains an
untested contributor. No production code or process affinity changed.

## Method

The scratch cycle addon adds GetCurrentProcessorNumber. The worker samples it
before the cycle/wall interval and after the interval, aggregating by starting
processor and counting differing endpoints. Samples can miss a migration away
and back during one invocation. They also do not measure migrations between calls,
exclusive core ownership, processor frequency, or instruction counts.

The four-worker procedure from `http-render-cycles-2026-09-10.md` is retained:
production Node 26.8.1, eXact/React/React/eXact order, ten-second HTTP warmup, isolated
before/after captures of 10,000 measured renders each after 10,000 warmup renders,
and a five-second HTTP window with two fresh drivers at concurrency 16 each.
Processes remain below normal priority. No build, test or profiler runs during
measurement. User workload may vary. Full freshly rendered documents are validated.

## Results on the same logical processor

Times are mean microseconds for synchronous invocation. These are subsets from
the same worker's before-loop and HTTP captures, grouped by starting processor.

| Worker | Logical processor | Loop calls | Loop time | HTTP calls | HTTP time |
| --- | ---: | ---: | ---: | ---: | ---: |
| eXact 1 | 14 | 9,779 | 22.84 | 21,761 | 48.98 |
| React 1 | 10 | 9,440 | 22.63 | 32,525 | 35.23 |
| React 2 | 4 | 9,230 | 22.50 | 3,771 | 32.80 |
| eXact 2 | 4 | 10,000 | 22.37 | 24,041 | 49.20 |

Whole HTTP invocation means are 55.36 and 54.93 microseconds for eXact, 39.24
and 38.99 for React. Their instrumented RPS are 7,952 and 8,109 for eXact, and
10,432 and 10,557 for React. No improvement is claimed from these diagnostic scores.

Differing start/end processor counts are 198/39,820 and 234/40,598 for eXact,
250/52,203 and 159/52,833 for React. Isolated captures generally concentrate on
one processor; HTTP invocations occupy several. The higher HTTP invocation cost
persists within substantial same-processor subsets. It cannot be explained solely
by comparing a fast logical processor in the loop with a slow one under HTTP.

The four HTTP windows contain 185,446 valid responses and zero errors, excluding
warmups and preflights. Cycle/placement counters include two driver preflights per
window. Complete output sizes remain 4,672 bytes for eXact and 3,660 for React,
matching isolated captures. Artifact hashes and server/adapter inventories remain
unchanged. All owned processes close; only the user's Codex Node remains.

## Topology and next control

The machine reports an AMD Ryzen 7 8745HS, eight cores and sixteen logical
processors. GetLogicalProcessorInformation confirms core pairs 0/1, 2/3, 4/5,
6/7, 8/9, 10/11, 12/13 and 14/15. This is measured topology, not an assumption
that adjacent processor numbers always share a core.

Same logical processor does not mean identical contention. The local HTTP drivers
and service are active during HTTP load and largely idle during isolated loops.
They may compete on sibling threads or migrate through the worker's core, affecting
resources even when the worker itself remains on one logical processor. This has
not yet been measured and must not be presented as the cause.

A focused next control can assign only task-owned worker and driver processes to
separate verified physical cores, preserving user process settings. Retain both
frameworks, full rendering, and the same placement/cycle instrumentation, then
compare isolated versus HTTP invocation cost. Affinity is an experimental control,
not a proposed framework optimization or a substitute for unpinned benchmarks.

The adjacent archive includes the native probe source/binary/build command,
topology reader and results, worker, runner, raw capture, summary, participant
artifacts and verified SHA-256 manifest. No browser/package acceptance is claimed.
