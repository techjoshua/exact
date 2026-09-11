# Body-boundary allocation experiment, September 10, 2026

Status: this isolated prototype reduces sampled allocation volume and Node collection counts. A response-consumption timing screen is mixed on Node and slower on Bun. It is not integrated into production. The workstation was in active use throughout these measurements.

## Hypothesis and scope

The current collecting sink accumulates a rope and avoids inspecting its characters on the ordinary size-limit path. Hydration insertion subsequently examines the completed document to locate its boundaries, then joins the augmented chunks. The allocation hypothesis was that this can materialize one extra document-sized string before the final hydrated document is returned.

An earlier body-checkpoint experiment was slower under an older result representation. This retest uses the current shared-getter result implementation and directly measures allocations and collection counts. The prototype preserves a separate closing-tag chunk at the compiled document body's closing position and uses that boundary fact during hydration insertion. The same renderer and sink operations still perform all component rendering.

This is an asserted bundle transformation, not a complete compiler change. The injected body flush is synchronous and fixture-specific. Production adoption would require an explicit compiler/runtime boundary contract, suspension handling, appropriate ownership through captured/retried output, and invalidation when output extensions change the document. It must not infer a trusted boundary from arbitrary markup or bypass output limits. No ABI, application code or runtime source changed here.

## Allocation and collections

Node 26.8.1, production mode, fresh processes, two reversed orders, 50,000 warmups. Separate inspector allocation samples cover 10,000 renders per process at a 16 KiB sampling interval, including minor-collected and major-collected objects. GC captures cover 20,000 measured renders per process. Both fixtures include four assets and full application-owned documents. Whole-document hashes match.

| Fixture | Metric | Current | Body boundary |
| --- | --- | ---: | ---: |
| 3 incidents | Estimated allocated KB/render | 73.15 | 68.91 |
| 96 incidents | Estimated allocated KB/render | 545.53 | 519.81 |
| 3 incidents | Collections / 20,000 renders | 90 | 85 |
| 96 incidents | Collections / 20,000 renders | 327 | 312.5 |

Both allocation pairs improve. The mean reductions are 5.8% and 4.7%. The allocation attributed to createChunkedHydratableResult falls from approximately 4.64 to 0.88 KB per small render and 26.95 to 0.88 KB per large render. The final join remains approximately 4.7 and 36.4 KB respectively. This is evidence that avoiding completed-document inspection removes an intermediate materialization, rather than eliminating the final output string.

These are sampled JavaScript heap allocations, not exact object counts, retained memory or all native memory. Collection counts can vary with runtime state. Mean summed GC event durations were 20.21 versus 17.65 ms for small documents and 70.67 versus 81.02 ms for large documents. Fewer collections did not establish less elapsed GC time for both fixtures. Active workstation use makes duration comparisons particularly uncertain.

## Response consumption

A separate small-document screen uses 50,000 warmups and 20,000 measured iterations per fresh production process. Each iteration renders the complete string, constructs a Response, and awaits its text consumption. This includes encoding/decoding and forces consumption, but is not an HTTP throughput test.

| Runtime | Order | Current microseconds | Body-boundary microseconds |
| --- | --- | ---: | ---: |
| Node | Current then candidate | 53.24 | 41.48 |
| Node | Candidate then current | 40.39 | 44.17 |
| Bun | Current then candidate | 37.68 | 38.27 |
| Bun | Candidate then current | 33.48 | 36.99 |

Node directions are mixed. Bun is slower in both pairs, approximately 5.8% on the two-run means. These results do not establish a cross-runtime speedup and do not justify adopting the synchronous fixture prototype. They do establish a concrete source of avoidable allocation worth considering in a properly designed document-boundary contract.

The control artifact is `069f9784fa667af7896202923a6c08622ae1bb3f4060054328314dbe1ae6619b`. Evidence is archived in `body-boundary-allocation-2026-09-10-evidence.zip`, including both bundles, provenance, transformation and measurement scripts, all raw allocation profiles, GC populations and response-consumption measurements. No new browser or package validation is claimed. All task-owned measurement processes closed.
