# Structural composition with profiling toggled

Status: counter-evidence against treating the prototype's earlier throughput gain
as a dependable improvement. No production change or adoption.

## Method

The matched control and combined artifacts run in four fresh Node 26.8.1 workers:
control/combined, then combined/control. Each worker warms for ten seconds and
then runs three five-second windows at total concurrency 32: profiler off,
inspector CPU profiler on, profiler off again. Two fresh drivers supply each
window. All processes run below normal priority in production mode; user PC use
may vary. The profiler requests 250-microsecond sampling. No other benchmark,
build, or test runs concurrently.

Private diagnostic endpoints reset telemetry and read CPU without starting the
profiler in the off windows. The diagnostic worker statically imports the inspector
and contains additional control routes even while profiling is off. Compared with
the earlier successful factorial run, the worker code, five-second measurement
duration, and sequential-worker schedule differ. That earlier run kept four workers
alive and interleaved 1.5-second blocks. These differences remain confounders.

The same worker and artifact persist through each off/on/off sequence. This controls
their identities, but profiler state always occupies the middle window; it does
not eliminate cumulative warmup, carryover, or changing machine load.

There are 493,293 valid measured responses and zero errors. All complete output
identities match. Artifact and built adapter/server identities pass the existing
post-run checks. All task-owned processes close; only the user's Codex Node remains.

## Results

Means across the two fresh populations. Render interval and process CPU use
microseconds per request; RPS is higher-is-better.

| Window               | Control RPS | Combined RPS | Control render | Combined render | Control CPU | Combined CPU |
| -------------------- | ----------: | -----------: | -------------: | --------------: | ----------: | -----------: |
| Profiler off, before |       8,897 |        8,156 |          55.85 |           60.91 |      120.35 |       139.74 |
| Profiler on          |       7,677 |        7,106 |          64.81 |           70.04 |      143.97 |       163.60 |
| Profiler off, after  |       8,991 |        8,452 |          56.04 |           59.30 |      118.90 |       130.21 |

Within each population and variant, the profiled window has lower throughput than
both surrounding off windows. Profiling overhead is material in this capture.
However, the combined artifact also trails control in every corresponding off
window across the two populations. Its average deficit is about 8.3% before and
6.0% after. Process CPU per request is higher as well. This cannot be explained
solely by the earlier profile using a low offered rate or by the profiler being on.

Render intervals include scheduling and asynchronous completion. Process CPU
includes helper threads and control work. Neither is a disjoint stage to add to
the other. The response counts prove these captures, not universal framework
capacity or a particular engine mechanism.

## Decision

The earlier combined wins remain recorded, but this contradictory result must
change the acceptance judgment. Reducing structural traversal is not yet a proven
general performance improvement. Do not integrate the fixture-specific prototype
or promise its earlier 17.9-27.7% Node gains will survive compiler integration.

Before modifying another rendering operation, reproduce the earlier comparison
with the original and diagnostic workers as the controlled difference. Hold block
duration and ordering equal. That can test whether the diagnostic environment
changes the result; machine and worker variation still need paired treatment.
If the gain remains unstable, favor simplifying the actual generated execution
with demonstrated semantic value rather than preserving an accidental runtime
configuration to obtain a favorable score.

No React rerun, browser acceptance, task/cancellation integration test, or production
compiler change occurs here. The complete performance objective remains unmet.
The adjacent archive preserves runner, worker, raw twelve-window capture, four
profiles, summary, log, measured artifacts, report, and verified SHA-256 manifest.
