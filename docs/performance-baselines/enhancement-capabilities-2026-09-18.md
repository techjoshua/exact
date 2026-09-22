# Enhancement capability dependency reduction

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

This change removes unused renderer implementations from a plain application without requiring
receiving components to know their enhancements. It reduces shipped code and retained memory.
The paired timings do not establish a general speedup.

## Implementation

- The text-host revision counter uses object-only reactivity instead of retaining Map/Set support.
- Client `title` and `textarea` receipts select a text-host runtime entry. Target integration also
  installs it for enhancement-selected hosts. The receipt constructor is reexported directly.
- Enhancement and Target providers install supplied-placement support. Plain mounting and adoption
  retain small capability gates, so separately compiled receivers and lazy providers still work.
- Prepared component construction is separated from ordinary mounting and can be removed when unused.
- The production comparison build rejects unused text projection, prepared attachments, placement,
  and collection support. No ahead-of-time fragment wrappers or receiver-awareness assumptions are added.

## Bundle and browser memory

The baseline is the enhanced working tree immediately before this dependency reduction, not the
September 14 release. Both artifacts use the same production build settings. JavaScript bytes below
exclude CSS. Gzip uses Node's default `gzipSync` independently for each shipped JavaScript file.

| Measurement            |    Before |     After |          Change |
| ---------------------- | --------: | --------: | --------------: |
| JavaScript bytes       |   225,353 |   208,753 | -16,600 (-7.4%) |
| JavaScript gzip bytes  |    68,973 |    63,785 |  -5,188 (-7.5%) |
| Retained JS heap bytes | 1,684,868 | 1,669,592 |         -15,276 |
| Backing storage bytes  |   226,207 |   209,607 |         -16,600 |
| Documents              |         1 |         1 |               0 |
| DOM nodes              |       218 |       218 |               0 |
| Event listeners        |        17 |        17 |               0 |

Five fresh-context post-interaction heap captures per artifact, with one discarded warmup round,
report identical JS-used-heap values within each side. Snapshot composition also decreases in code,
shapes, closures, and native allocations. The first paired snapshot has code -8,856 bytes, shapes
-668, closures -1,832, and native -33,432. These accounting views overlap and must not be summed
with used heap or backing storage. The results support the footprint explanation; this is not a
long-running leak or churn test.

Including unchanged CSS, total client delivery is 213,256 raw bytes and 65,590 gzip bytes. That is
still above the September 14 baseline of 206,994 / 63,488. This removes about 73% of the raw growth
and 71% of the gzip growth identified in the [size audit](enhancement-size-audit-2026-09-18.md).
The remaining cost includes structural receipt and root-ownership support; it has not disappeared.

## Paired browser timing

Node 26.8.1 and Chromium 149.0.7827.55 run immutable before/after client assets over the same
uncompressed in-memory Node transport. Both eXact clients receive documents from the same current
server renderer, using their own asset tags. This isolates the client change rather than comparing
server throughput. The interaction must settle at Alex Chen / Version 2 without page errors.

Twelve fresh-context rounds plus one discarded warmup alternate before/after/unchanged React control
and reverse order. Cache is disabled, with no CPU throttling. Navigation-to-semantic-ready medians
are **44.80 ms before and 44.45 ms after**; React control is 46.50 ms. Individual eXact samples overlap
substantially, so the 0.35 ms difference is not evidence of a meaningful speedup. This shorter
diagnostic protocol does not replace the full comparison charts or their published percentile lane.

Power scheme, processor counters, and process CPU totals were sampled between browser rounds.
The scheme stayed Balanced; reported processor utility ranged from 1% to 42%, maximum-frequency
percentage from 38% to 93%, and the frequency field stayed at 3,801 MHz. These are coarse snapshots,
not continuous effective-clock or thermal measurements. No build, test, or V8 tracing ran alongside
timed captures. These readings cannot explain the earlier cross-day slowdown retroactively.

## Enhancement workload timing

Four alternating before/after rounds use the existing protocol-2 isolated Node/JSDOM harness:
100 receivers, ten updates, 20 client warmups, 500 SSR warmups, and 21 samples per process.
Each mount/update, hydration, and SSR lane runs in separate fresh processes. Values below are
medians of the four process medians in milliseconds. Unminified fixtures support profiling.

| Workload              | Mount before / after | Updates before / after | Hydration before / after | String SSR before / after |
| --------------------- | -------------------: | ---------------------: | -----------------------: | ------------------------: |
| Plain                 |        2.147 / 2.123 |          4.347 / 4.245 |            1.698 / 1.737 |             0.142 / 0.145 |
| Intrinsic enhancement |      12.585 / 12.785 |          5.505 / 5.533 |           10.456 / 9.928 |             0.654 / 0.651 |
| Component enhancement |       9.998 / 10.021 |          1.434 / 1.424 |          10.953 / 10.998 |             0.456 / 0.463 |
| Explicit target       |        7.628 / 7.736 |          5.261 / 5.114 |            6.733 / 6.611 |             0.468 / 0.471 |

Most changes vary in direction across rounds. Plain hydration is 2.3% slower in aggregate and
slower in all four rounds (0.2% to 6.7%); plain updates are faster in all four. This is a memory
and bundle optimization with a small measured plain-hydration cost, not proof of universally faster
dispatch. HTML bytes, materialized host counts, retained hydration owners, and zero replaced
elements remain equal. Full raw samples and per-round changes are retained.

In this capture, the Intl benchmark fixture failed on both sides with
`Task component construction requires the compiler-selected task capability`. It supplies no valid
performance comparison. Intl correctness is covered by the passing package suite, including
prepared text and text-host behavior. Do not present those tests as an Intl timing result.
The subsequent [compiler correction](intl-capability-fix-2026-09-18.md) resolves this failure and
records a successful current diagnostic run. It does not create missing historical measurements.

## V8 bytecode, optimization, and shapes

V8 inspection ran separately from timing, using Node 26.8.1. `--print-bytecode` exposed
`CreateRestParameter` and `CallWithSpread` in an initial capability forwarding wrapper. Replacing
rest/spread with explicit arguments removes both operations. Bytecode grows from 34 to 43 bytes,
but avoids the argument-array path. Bytecode length alone is not an optimization objective.

`--trace-opt --trace-deopt --trace-file-names` exercised plain, intrinsic, component, and explicit
target mount/update/hydration workloads. Framework-client deoptimization events were 197 before
and 202 after, including 110 / 112 wrong-map events. The mixed workloads change receipt and target
types and include warmup; these totals do not establish steady-state churn. The new retain gate
reaches Maglev compilation. The traces do not justify claiming zero deoptimizations or optimal
machine code, and no speculative broad object-layout rewrite was made.

With `--allow-natives-syntax`, `%HaveSameMap` confirms equal shapes for prepared attachments before
and after abort, and for repeated ordinary and keyed intrinsic receipts. `%HasFastProperties` is
true for these objects; receipts remain frozen. Existing declared fields and cleanup assignments
preserve these shapes. This check covers these allocations, not every renderer object shape.

## Validation and evidence

The workspace build, 2,212 package tests (15 skipped), native compiler suites, compiled ABI check,
source architecture, JSDoc, platform boundaries, package contents, and documentation typecheck/build
pass. The native compiler test covers client/server title, textarea, and ordinary-element capability
selection. The unchanged package suite covers default/external enhancement ownership, supplied
placement, text projection, hydration, and cleanup.

The [structured results](enhancement-capabilities-2026-09-18.json) retains measured comparisons and capture metadata.
Bulk raw captures and build archives are not retained; see the [retention policy](benchmark-retention.md).
