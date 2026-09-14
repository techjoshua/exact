# Retained build HTTP comparison, September 9, 2026

The retained build beats React for Node streaming. React remains ahead for Node strings,
Bun strings, and Bun streaming. The performance objective remains unmet.

Unlike the preceding focused renderer experiments, this capture uses runtime-specific participant
artifacts and their actual response adapters. The Node and Bun eXact artifacts match the frozen
marker-current snapshots byte for byte. All four retained optimizations are included: root-attribute
preparation, stateless bookkeeping, keyed-program wrapper removal, and deferred marker formatting.
No rejected or diagnostic prototype is included.

## Method and results

Node 26.8.1 and Bun 1.4.2. Worker creation explicitly sets NODE_ENV=production. Both frameworks render
their full application-owned documents on every request, using preloaded three-incident controlled
service data and empty client asset tags. This measures rendering and HTTP capacity without repeated
service fetches. It is not a complete browser or application-load benchmark.

Two reverse-order populations per runtime and output mode, 16 populations total. Two independent
load drivers each supply concurrency 16, for 32 aggregate requests in flight. Each population has
two seconds of warmup and four seconds of measurement. Throughput counts valid responses over
the combined driver measurement interval. The initial response is checked for a full document;
every measured response is validated against that complete body's byte count and SHA-256 hash.

All 388,339 measured responses were valid. There were zero measured errors.

| Runtime | Output | eXact requests/s | React requests/s | eXact relative throughput |
| ------- | ------ | ---------------: | ---------------: | ------------------------: |
| node    | string |            5,975 |            7,679 |                    -22.2% |
| node    | stream |            5,051 |            3,323 |                    +52.0% |
| bun     | string |            7,047 |            7,884 |                    -10.6% |
| bun     | stream |            5,594 |            5,921 |                     -5.5% |

These are medians of two short local populations, not confidence intervals. Absolute throughput is
lower than the earlier capture on this shared machine. Without a starting-build control in this run,
that change cannot be attributed to the marker optimization. Compare framework ratios within this
capture. The Bun streaming gap is much smaller here than in the large-document renderer diagnostic;
the workload size, output consumption, and adapters differ, so those results are not interchangeable.

## Remaining work

The result establishes the current HTTP comparison, not completion. Node string throughput needs
approximately 28.5% improvement to match the measured React rate; Bun string and streaming need
approximately 11.9% and 5.8%. Those figures describe this workload and capture only.

No production code changed for this measurement. Public full-benchmark charts remain labeled with
their historical capture; this focused run does not replace browser navigation, interaction, memory,
service-backed load, or larger-document results. Earlier browser correctness checks are documented
in the allocation report, but no new browser timings are claimed here.

[Raw populations](retained-http-2026-09-09.json) and
[evidence archive](retained-http-2026-09-09-evidence.zip) preserve the measurement and its artifacts.
Reproduction requires the locked repository, including React 19.2.0 installed beneath
framework-comparison/node_modules. No task-owned benchmark processes remain after cleanup.
