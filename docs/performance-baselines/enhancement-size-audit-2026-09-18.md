# Enhancement capture audit, September 18, 2026

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

The broad timing slowdown cannot be attributed to the enhancement changes from these captures.
React and TanStack Start shipped byte-identical client artifacts in the September 14 and 18 runs.
Their navigation means increased 13.4% and 13.9%; eXact increased 8.3%. All five frameworks had
higher navigation, paint, and optimistic-feedback means, but lower authoritative-settlement means.
Recorded Node, Bun, Chromium, Windows, CPU, and memory metadata match. The capacity plans and
sample counts match; balanced measurement order advanced from round 17 to 18.

This establishes a shared measurement difference, not its cause. Historical captures lack CPU
frequency, thermal, power-source, power-plan, and whole-machine background-CPU histories. A current
power-plan query reports Balanced, which does not establish the plan or effective clocks during
either capture. A fresh restart does not supply the missing evidence. Do not explain the slowdown
as background load without measuring it. The next useful timing experiment is repeated unchanged
control builds with those telemetry fields recorded, followed by interleaved before/current eXact
builds under the same conditions.

## Where the client code grew

Separate production builds with source maps compare the clean pre-enhancement commit `056b1154`
with the measured worktree. Profiling instrumentation is disabled and the captured production
artifacts are untouched. Removing the source-map comment yields current JavaScript whose SHA-256
exactly matches the captured application (`ba22452ba67faaf37f1e2d7303a6afa54c3be6a19a13e9c36a7bad68040f1d5d`).
The before/current JavaScript sizes are 202,562 and 225,353 bytes, a 22,791-byte increase.
The September 14 baseline predates a small reactive-selection fix, so its historical increase is
22,862 bytes. These baselines must not be conflated.

Source-map attribution identifies these largest additions. Counts are approximate minified,
uncompressed bytes assigned to mapped source spans, not independent gzip costs.

| Added module                                                          | Bytes |
| --------------------------------------------------------------------- | ----: |
| Reactive Map/Set implementation (`reactive/src/proxy/collections.ts`) | 3,450 |
| Prepared component attachment                                         | 2,138 |
| Text component projection                                             | 1,985 |
| Text render-program projection                                        | 1,690 |
| Text projection markup serialization                                  | 1,572 |
| DOM supplied-target placement                                         | 1,521 |
| Core text projection                                                  | 1,188 |
| Core target prop composition                                          |   833 |
| Core supplied-target placement validation                             |   790 |

Mounting, adoption, component-root tracking, receipt metadata, and document recognition account for
additional growth. This is framework runtime code, not increased authored application source.
The benchmark does not use enhancements, yet ordinary mounting/adoption now retains text-host
projection and prepared-output machinery. The existing optional-enhancement-host guard excludes
the old enhancement modules but does not cover these new dependencies.

One concrete avoidable dependency is `dom/src/renderer/text-host-presentation.ts`: its single
revision counter uses general `reactive({ value: 0 })`. This retains `reactive.ts`,
`proxy/create.ts`, and the Map/Set implementation, approximately 3,853 mapped minified bytes
together. The counter needs scalar invalidation, not general observable collection support.
Fix this at the runtime dependency boundary. Then investigate making text projection and supplied
placement independently includable while preserving enhancements attached by callers or defaults.
Do not infer that a receiving component cannot be enhanced merely from its own source.

## Retained memory

The separate five-snapshot heap-composition lane shows these mean changes:

| Measurement                 | Increase, bytes |
| --------------------------- | --------------: |
| JavaScript used heap        |          32,516 |
| Snapshot code               |          20,544 |
| Snapshot object shapes      |           2,608 |
| Snapshot ordinary objects   |             900 |
| Snapshot closures           |           2,412 |
| Snapshot arrays             |           2,052 |
| Snapshot native allocations |          45,158 |
| Backing storage             |          22,862 |

Code and object-shape metadata account for most of the additional JavaScript heap by scale.
The backing-storage increase exactly matches the historical JavaScript byte increase. However,
snapshot categories, backing storage, and `JSHeapUsedSize` are distinct accounting views and must
not be added together. Native allocation growth requires allocation/retainer attribution before
claiming it is entirely source storage. Document, DOM-node, and listener counts are unchanged in
this lane. These observations support a code-footprint explanation, not proof of a leak or proof
that every added byte is metadata.

The [full capture](enhancement-framework-2026-09-18.md) retains the raw historical and current
measurements. Diagnostic build and attribution scripts and module-level results are in
`.tmp/enhancement-size-audit`. No runtime changes or replacement timing results are part of this audit.

The subsequent [capability optimization](enhancement-capabilities-2026-09-18.md) implements these
dependency reductions and records a same-session paired comparison, including V8 inspection.
