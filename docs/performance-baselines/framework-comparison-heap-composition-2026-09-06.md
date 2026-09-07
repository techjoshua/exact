# Browser heap composition, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

This is a separate diagnostic capture, not a before/after performance comparison. The user's earlier
heap breakdown predates the recent optimization experiments; this capture cannot establish why that
earlier breakdown differs. Compare frozen artifacts through the same collector to attribute a change.

The raw evidence (local capture: `framework-comparison-heap-composition-2026-09-06.json`) retains all 25 snapshots'
node-type summaries, memory counters, balanced round orders, machine information, Chromium version,
commit, dirty-working-tree status, and participant artifact hashes. Raw snapshot strings are discarded
after summarization. The public projection is
[`performance-heap-report.json`](../../apps/docs/src/data/performance-heap-report.json).

All 35 controlled-service correctness cases passed before capture. One discarded scenario round
precedes five recorded rounds, each rotating through all five participants. Every sample uses a fresh,
cache-disabled page, loads incident `inc-100`, waits for the live service, claims the incident, verifies
authoritative owner Alex Chen and Version 2, waits for a rendering opportunity, and collects garbage.
CPU, allocation, and coverage profiling are disabled. Chromium is 149.0.7827.55.

| Mean snapshot self-bytes, decimal KB |     eXact |     React | SvelteKit |      Nuxt | TanStack Start |
| ------------------------------------ | --------: | --------: | --------: | --------: | -------------: |
| V8 code / metadata                   |   723.436 |   549.396 |   395.140 |   589.532 |        864.544 |
| V8 internals / shapes                |   167.436 |   152.300 |   146.444 |   167.744 |        198.900 |
| Objects, arrays / closures           |   304.880 |   261.416 |   245.240 |   259.312 |        329.020 |
| Strings / source text                |    96.664 |   102.014 |    80.244 |    87.680 |        120.241 |
| Native nodes                         |   919.684 |   927.338 |   710.532 |   788.540 |      1,189.914 |
| Other nodes                          |     1.160 |     0.560 |     1.280 |     0.740 |          0.697 |
| Total                                | 2,213.260 | 1,993.025 | 1,578.880 | 1,893.548 |      2,703.315 |

Code nodes explain 174.040 KB of the 220.236 KB eXact-minus-React snapshot difference, approximately
79%. Excluding code nodes leaves a 46.196 KB difference in this capture. Excluding the separate
internal/shape category as well leaves 31.060 KB; that category is not all compiled-code metadata.
These are current-build observations, not a correction to an older-build measurement or proof that
recent changes caused the difference.

Each node contributes its self-size once. The arithmetic category means add to the arithmetic total;
rounded display values may differ in the last digit. Code nodes include V8 code and metadata. Hidden
and object-shape nodes are separate. String nodes include source strings but are not exclusively source
text. Object, array, closure and regexp nodes include engine-owned and framework-owned data. Native
nodes include browser objects represented in the snapshot. Remaining and future node types stay in
Other. No category is inferred by subtracting a snapshot total from `JSHeapUsedSize`, and overlapping
dominator retained sizes are never summed. Snapshot self-bytes and the warm heap distribution on the
docs page are different metrics from different capture populations.

Reproduce from the repository root:

```sh
npm run measure:heap -w @exactjs/framework-comparison-suite
node scripts/component-local-target-abi/publish-docs-heap-report.mjs framework-comparison/results/browser-heap.json
```

The chart's nested table exposed a compiler defect: an inner keyed map under an outer native map with
an index reused the first iteration's closure. The compiler now emits those inner keyed operations per
native iteration. It requires no ABI addition or runtime cache allocation. A compiler contract test,
composition behavior test, and production browser table-to-report assertions protect the correction.
Rebuilding the eXact comparison participant retained the captured client artifact hash, so this
correction does not change the browser artifact represented by this heap evidence.
