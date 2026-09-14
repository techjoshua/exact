# Removing direct-writer forwarding callbacks

Date: 2026-09-09. Retained prototype refinement; production unchanged.

Four Node CPU profiles compare current production with the deferred-string-sink direct writer,
using the actual comparison app at three and 96 incidents with four assets. The profiler starts
after 5,000 warmups and records 50,000 complete string renders. It includes profiler API overhead
around start/stop; it excludes module startup and warmup. Self-time samples are diagnostic, not
allocation measurements or a substitute for paired unprofiled timings.

The direct writer shows sampled work in renderDirectWriter and executePreparedDirectWriter,
while serialization and GC remain prominent in both implementations. Source inspection identifies
two forwarding closures created at each operation-target program call, including leaf programs
that never render a child or prepare a sibling. This supports experiments removing those closures;
profiles alone do not prove their exact cost.

## Leaf metadata experiment, not retained

The first candidate labels the 25 transformed programs according to child operations. Fourteen
leaf programs omit the otherwise-unused callbacks. Small cases improve, but large cases regress
in both pairs on both runtimes. No compiler metadata was added to production.

Times below are control / candidate microseconds, with percentage time change. Control is the
previous deferred-string-sink prototype, not production. Positive means slower.

| Runtime | Scenario | Pair 1 | Pair 2 |
| --- | --- | --- | --- |
| node | assets | 36.75 / 36.33 (-1.15%) | 37.14 / 36.04 (-2.97%) |
| node | large | 164.07 / 164.57 (+0.31%) | 164.54 / 165.65 (+0.68%) |
| bun | assets | 34.85 / 33.86 (-2.83%) | 37.15 / 34.61 (-6.84%) |
| bun | large | 211.66 / 216.07 (+2.08%) | 213.59 / 216.20 (+1.22%) |

## Direct target forwarding, retained in the prototype

Instead of metadata and per-leaf selection, the second candidate passes the existing operation
target to the writer. Deferred children call its existing renderProgramSegment method directly.
Sibling preparation uses one shared function whose receiver is the writer output; it reads the
target's context, parent, and options. Component-content callbacks retain their existing handling.
This removes the two operation-target forwarding closures without creating a second traversal
or changing preparation timing. It does not reuse request frames across components.

| Runtime | Scenario | Pair 1 | Pair 2 |
| --- | --- | --- | --- |
| node | assets | 37.17 / 36.27 (-2.44%) | 36.78 / 36.65 (-0.33%) |
| node | large | 164.97 / 161.11 (-2.34%) | 164.38 / 161.27 (-1.89%) |
| bun | assets | 34.27 / 34.03 (-0.70%) | 34.18 / 34.10 (-0.25%) |
| bun | large | 213.38 / 209.49 (-1.82%) | 215.36 / 207.73 (-3.54%) |

Both experiments use fresh production-mode Node 26.8.1/Bun 1.4.2 processes, 5,000 warmups and
12,000 measured string renders. Two reversed-order pairs per runtime/scenario retain all samples.
All paired complete-document hashes match, including the app shell, assets, and hydration.
No other builds or tests ran during timed measurements.

The target-forwarding candidate improves all eight pairs and is retained as the next integration
base. These modest gains do not establish a production win or React parity. The latest production
comparison remains the production-refresh report. Full compiler-native staging and broader
boundary integration remain outstanding.

## Ownership and output checks

Six Node/Bun scheduled-child cases cover success, failure before visiting the second child, and
cancellation with the task gate closed. Both tasks start and both children dispose once; host
state unwinds. These use compiler-generated child tasks and the existing controlled parent
program, exercising the new target preparation receiver.

Forty application budget cases compare the candidate with production across ASCII/hostile Unicode
and five limits. Eight consumed-stream cases match the corresponding production stream exactly.
The audit originally printed a fixed six-stream label inherited from a three-variant harness;
its counter now derives from the actual two variants, and the corrected audit passes. No browser
timing or new browser-adoption result is claimed for this candidate.

Raw profiles, summaries, both experiments, source transformations, application and lifecycle
audits, frozen artifacts and SHA-256 hashes are archived. The overall performance goal is incomplete.
