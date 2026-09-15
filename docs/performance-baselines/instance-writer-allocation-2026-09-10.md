# Instance-bound writer allocation and GC follow-up

The receiver-reading prototype from [the instance-bound writer investigation](instance-bound-writer-2026-09-10.md) does not demonstrate lower allocation volume or fewer collections. It remains outside production source. This evaluates folding three stateful root invocations into their component frames, not a compiler that removes all intermediate fragment packaging.

Node 26.8.1 runs both frozen variants in fresh production processes with two reversed orders. Each process warms for 50,000 renders. Documents have three or 96 incidents, four assets and complete application-owned shells. Whole-document hashes match between variants. GC observations cover 20,000 measured renders per population. Separate allocation captures cover 10,000 measured renders with the inspector's 16 KiB sampling interval and both minor-collected and major-collected objects included.

Means across the two populations:

| Fixture      | Metric                         |   Current | Instance-bound |
| ------------ | ------------------------------ | --------: | -------------: |
| 3 incidents  | Sampled allocated bytes/render |  73,366.9 |       73,418.0 |
| 96 incidents | Sampled allocated bytes/render | 545,090.2 |      545,182.5 |
| 3 incidents  | GC events / 20,000 renders     |      89.5 |           89.5 |
| 96 incidents | GC events / 20,000 renders     |     327.5 |          327.0 |
| 3 incidents  | Summed GC event duration, ms   |     21.58 |          20.01 |
| 96 incidents | Summed GC event duration, ms   |     92.21 |          94.88 |

Individual GC counts are current 90/89 versus candidate 90/89 for the small fixture and current 327/328 versus candidate 327/327 for the large fixture. Allocation changes are approximately +0.07% and +0.02%, too small to establish a meaningful difference using sampling. The removed source-level wrappers did not translate into an observed allocation-volume reduction.

The user reported beginning to use the PC during this GC capture. Treat elapsed render timings and GC event durations as affected by uncontrolled workload. Small-document render means were 31.79 versus 32.05 microseconds, and large-document means 194.23 versus 205.61. These are preserved observations, not a clean timing confirmation. Summed GC event duration is elapsed event time, not GC CPU time. Sampled bytes estimate JavaScript heap allocation including collected objects; they do not measure all native allocation, retained memory, exact object counts or total process memory. No Bun allocation or GC measurement is claimed.

The current control artifact is `069f9784fa667af7896202923a6c08622ae1bb3f4060054328314dbe1ae6619b`. Both variant hashes, raw profiles, all populations and measurement scripts are in `instance-writer-allocation-2026-09-10-evidence.zip`. No compiler, runtime or application implementation changed. The next useful instance-writer experiment must remove more than the three root wrappers, while preserving preparation snapshots and continuation ownership.
