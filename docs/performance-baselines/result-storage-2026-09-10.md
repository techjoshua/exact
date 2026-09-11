# Request-owned result storage, September 10, 2026

Status: source candidate integrated and validated for correctness. HTTP captures confirm Node gains and a Bun string tradeoff; final retention remains under investigation. The overall performance objective remains unmet.

Follow-up: [result construction](result-construction-2026-09-10.md) records the next experiments and the current individual-descriptor refinement. The original measurements and artifact hashes below describe the descriptor-map candidate.

## Survival evidence

Following the GC promotion trace, a separate Node allocation capture excludes objects collected by minor GC while retaining samples of objects collected by major GC. Each fresh production process warms 50,000 renders and samples 10,000, with a 16,384-byte interval. Both frameworks render their complete application-owned shell and four asset tags, using the three-incident and 96-incident fixtures. This is a diagnostic survivor-biased sample, not an exact measurement of promoted bytes: objects still live in the nursery at capture end are also included.

Estimated sampled bytes per render are 12.08 kB for small eXact versus 0.38 for React, and 77.05 kB for large eXact versus 1.93 for React. The largest eXact sites are final HTML join (4.66/36.38 kB for small/large), createChunkedHydratableResult (4.29/26.46), and string replacement (0.77/10.34). This shifts attention from traversal scaffolding to final result storage. The capture identifies allocation origins, not exact heap retainer paths.

## Implementation

String and hydratable result factories now use shared enumerable/configurable own accessors. A non-enumerable private symbol stores each result's chunks, memoized materialization and, for hydratable results, its source result and deferred resumption reader. Accessors no longer close over request-local data. This differs from the rejected September 9 shared-getter experiment, which used a WeakMap for storage. The shared renderer and += traversal sink are unchanged.

Ordinary property reads, enumeration order, lazy materialization, cached HTML, source-result reads, frozen preload metadata and deferred resumption behavior remain intact. Reflectively detaching an accessor now requires the appropriate result receiver instead of retaining the original result through a closure. Internal symbol reflection exposes an additional private storage symbol. These are unreleased representation changes, not compiler-emitted ABI changes; no compatibility-only getter closure is retained.

## Focused measurements

The asserted bundle prototype precedes source integration. Node GC-event capture uses two reversed orders of retained/candidate/React, 50,000 warmup and 20,000 measured renders per fresh process. GC durations are elapsed event durations, not sampled process CPU time. No allocation sampler runs concurrently.

| Fixture | Variant | Microseconds/render | GC duration per 20,000 renders, ms |
| --- | --- | ---: | ---: |
| 3 incidents | Retained | 26.01 | 54.88 |
| 3 incidents | Candidate | 23.79 | 13.58 |
| 3 incidents | React | 21.52 | 8.59 |
| 96 incidents | Retained | 171.66 | 320.66 |
| 96 incidents | Candidate | 138.23 | 71.70 |
| 96 incidents | React | 134.09 | 56.21 |

Both Node orders improve. The large renderer gap to React narrows to 3.1%, while GC duration falls approximately 78%. This supports the result-storage representation as a source of avoidable GC cost; it does not prove the exact engine-level retention mechanism.

Separate Bun string timings use the same warmup, iterations and two reversed candidate/control orders. Small means are 29.18 retained versus 27.89 candidate; one pair improves and the other is approximately tied. Large means are 217.46 versus 221.54, approximately 1.9% slower, with both pairs slower. All populations are retained. This tradeoff motivates integrated HTTP acceptance checks rather than claiming a uniform gain.

## Integration and validation

The candidate is in packages/ssr/src/render/output-result.ts. Two focused tests cover independent lazy materialization, metadata, enumeration, and deferred resumption reads. All 352 SSR tests in 55 files pass. Test type-checking, package TypeScript build, targeted ESLint, source architecture, JSDoc and the explicit-any ratchet (73/73) pass. The release ABI check reports the initial epoch-1 0.5.0 baseline; frozen fixtures were not regenerated.

An initial TypeScript assertion error after defineProperties was corrected by explicitly asserting the descriptor-established result type through unknown. The emitted runtime behavior did not change. The comparison client, Node server and Bun server were rebuilt. All 56 controlled-service browser checks pass across Node/Bun string/stream, including hydration and application interactions. No public documentation change is needed for the internal representation; public property usage is unchanged.

Integrated Node artifact SHA-256: `fe7f3f5186bd712f4f0eab4820eee07a7261dfc2a2124b92c8271c56fccae72b`.
Integrated Bun artifact SHA-256: `d8ac8e10c234c0d07c9e1af1a6821f0b235d9c89533816fd7aa9b4b6f8cad159`.

Platform-boundary bundling and compiled-ABI validation also pass. Frozen artifacts exercise client tasks, reactive updates, keyed identity, SSR, hydration and disposal against the candidate runtime. Package-content validation passes when invoked through npm's execution context; a preceding direct invocation failed to spawn npm.cmd on Windows. No benchmark ran during these checks.

## Integrated HTTP results

Twenty-four fresh processes compare previous/candidate/React for both runtimes and modes, with ten seconds of warmup and six seconds of measurement, two load drivers at concurrency 16 each, complete response identities and two reversed orders. All measured responses pass, with zero errors. Each framework owns its complete document. These are focused controlled-fixture throughput measurements, not a rerun of the full public benchmark suite.

| Runtime | Mode | Previous requests/s | Candidate requests/s | React requests/s |
| --- | --- | ---: | ---: | ---: |
| Node | String | 6705.4 | 7130.1 | 9300.7 |
| Node | Stream | 5934.5 | 6032.1 | 3783.6 |
| Bun | String | 7911.0 | 7580.8 | 8180.0 |
| Bun | Stream | 5908.8 | 5943.2 | 5844.4 |

Node string improves 6.3%, Node streaming 1.6%, and Bun streaming 0.6%. Bun string declines 4.2%; the first pair is nearly flat and the second is slower. A separate four-process Bun string confirmation retains the same warmup and measurement duration and two reversed orders. It averages 7950.7 previous versus 7748.1 candidate requests/s, a 2.5% decline. One confirmation pair is slower and the other approximately tied. Both captures remain intact; no slow population is discarded.

The candidate remains in the working source and rebuilt applications for further experimentation, but is not yet declared a retained improvement across the target workloads. The next hypothesis is to construct shared-accessor result objects directly instead of redefining placeholder data properties, reducing construction overhead while preserving the GC benefit and ordinary result behavior. This follow-up has not been implemented or measured here.

All task-owned processes closed after validation. Evidence: `result-storage-2026-09-10-evidence.zip` contains survivor-biased allocation profiles, prototype and integrated hashes, source snapshots, runners, raw timing/GC/HTTP captures and browser logs.
