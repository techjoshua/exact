# GC telemetry availability correction

The native Bun investigation exposed a measurement defect: the installed Bun runtime does not
advertise `gc` in `PerformanceObserver.supportedEntryTypes`, but the comparison workers still
reported numeric zero collections. Native inspector observations recorded collections during the
same kind of workload, so those zeroes were not valid evidence of absent GC.

The shared garbage-collection meter now checks observer support and setup success. Unsupported
observations report `available: false`, `count: null`, and `durationMs: null`. Load-process samples
use `gcAvailable`, `gcCount`, and `gcMs` with the same distinction. Supported observations drain
pending records before snapshots and discard pending records when resetting the interval.

The comparison adapter omits comparative GC metrics when any participant in a lane reports
unavailable observations. Historical captures without availability metadata retain their recorded
values; their zeroes do not establish runtime support. Framework-comparison methodology,
engineering performance documentation, and public performance guidance explain the distinction.

Validation:

- All 86 framework-comparison tests pass.
- The seven comparison-adapter tests pass, including omission of unsupported GC metrics from
  both reported metrics and raw aggregate populations.
- Actual Node and Bun workers pass string and stream checks, with stable complete-document
  hashes across resets. Node reports numeric observations; Bun reports unavailable values.
- Actual Node and Bun load-process meters report the expected availability.
- Targeted ESLint, formatting, source architecture, JSDoc, and whitespace checks pass.
- No benchmark-owned servers or load drivers remain.

The framework renderer, sinks, compiler and scheduling policy are unchanged by this correction.
It improves measurement accuracy rather than claiming an SSR throughput improvement.

## Broader investigation status

The [six experimental captures](ssr-performance-continuation-2026-09-11.md) validated 1,127,114
HTTP responses. The [native GC capture](bun-native-gc-ssr-2026-09-11.md) validated another
158,019. Both sets had zero response errors. The browser capture passed 288 measured scenarios,
and sparse checks passed 18 measured responses after 30-second idle periods.

The last uninstrumented large-document native Bun string comparison averaged 2,853 RPS for
immediate eXact and 3,005 RPS for unchanged React, a 5.1% remaining gap. Scheduled eXact averaged
2,473 RPS on that workload. Native GC events show that scheduling increased full collections
from 13-14 to 155-158 per ten-second measured block. Immediate eXact's GC event span per request
was about 45 microseconds versus React's 39-40 microseconds. Event spans are not exclusive CPU
costs and do not establish GC as the sole cause of the throughput gap.

None of the new scheduler, sink, key-enumeration, fused-serialization, or generated-projector
candidates justified replacing the retained implementation. Browser navigation is ahead of React
in the current measured cells, but the objective of beating React across every comparable SSR
workload remains unmet. This report closes the recorded experiments and validation, not that
broader performance objective.
