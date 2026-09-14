# Prepared keyed-program HTTP follow-up, September 10, 2026

The earlier render-and-consume experiment improved three of four median timings slightly. Its
initial rejection based on the Node string result was premature as an end-to-end performance
decision. This follow-up measures the unchanged candidate through the native HTTP adapters.

| Runtime/output | Current eXact RPS | Candidate RPS | React RPS | Candidate change | Faster pairs |
| -------------- | ----------------: | ------------: | --------: | ---------------: | -----------: |
| Node string    |             8,368 |         8,283 |    11,544 |            -1.0% |          3/6 |
| Node stream    |             7,054 |         7,276 |     5,143 |            +3.2% |          3/6 |
| Bun string     |            10,579 |        10,485 |    10,537 |            -0.9% |          2/6 |
| Bun stream     |             8,461 |         8,385 |     8,175 |            -0.9% |          2/6 |

There were 941,279 valid measured responses and zero errors. Every started measured request
completed and passed response identity validation. The candidate and current eXact documents match
byte-for-byte within each cell, including hydration. Both frameworks render their complete authored
documents per request with four asset tags. Application data is preloaded for this SSR isolation.
React is unchanged. The candidate remains an artifact experiment; production is unchanged.

All six variant orders run in each of four runtime/output cells, 72 blocks total. Each worker warms
for ten seconds. Measured blocks last 1.5 seconds with two load drivers at concurrency 16 each.
Node 26.8.1 and Bun 1.4.2 use production mode, native HTTP adapters, and priority 10. No other
benchmark, profiler, build, or test runs concurrently. The user may use the PC. Rates are arithmetic
means of the six measured blocks, not dedicated-machine capacity claims.

The shortcut does not show a consistent HTTP gain. Its Node streaming average improves, but only
three of six pairs improve. Small regressions in the other means are also exposed to workstation
variation. The result does not justify production adoption yet, and it does not justify declaring
the structural idea exhausted. The original trace confirms it eliminates three child traversals
while preserving the same 24 writer executions.

Current eXact substantially exceeds React in Node streaming in this run, is close in Bun string,
and has a modest Bun streaming lead. Node string remains the substantial gap: current eXact is
27.5% below React in valid RPS. A small gap in the earlier render-and-consume timing does not explain
that difference by itself. That Node harness additionally constructs and decodes a Web Response,
which neither actual Node HTTP string path uses. Further attribution must separate this harness
cost from response construction, adapter behavior, encoding, and socket work.

No package or browser validation is claimed for an integrated candidate because none was installed.
The earlier changing-input checks and request traces remain applicable to the identical artifact.
The shared process owners closed all workers and drivers after the run.

[Evidence archive](keyed-program-http-2026-09-10-evidence.zip) preserves native HTTP results,
artifacts, runners, source snapshots, and SHA-256 hashes. The earlier measurement remains available
in [the render-and-consume report](keyed-program-2026-09-10.md).
