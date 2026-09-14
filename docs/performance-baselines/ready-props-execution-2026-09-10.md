# Direct execution after props preparation

Status: neither prototype is adopted. Investigation remains open following the user's request to explain why a plausible optimization regresses. The corrected variant preserves selected metadata, passes focused probes and measurably reduces allocation, but increases large-Node process CPU consumption. Production remains the validated execution-target integration.

## Hypothesis

`executeDirectSsrComponent` passes its entire execution body as a callback to mapRenderValue even when props are already ready. The experiment extracts that body into a regular internal function, calls it directly for available props, and creates a continuation only for pending props. Child issuance, component frames, publication, observer hooks, rollback and disposal still run through the existing implementation. No second rendering engine or sink mode branch is introduced.

The working hypothesis is a small reduction in allocation, approximately 1-3%, with a possible 0-3% timing benefit from avoiding one callback per synchronous component. Those timing expectations have not been tested. Remaining nested callbacks and their captured state still exist, and optimized allocation cannot be inferred from source closure counts alone.

## Allocation capture and integration confirmation

Twelve fresh Node 26.8.1 production processes use two reversed orders for three variants and two fixture sizes. Each process performs 50,000 warmups and samples 10,000 renders with a 16 KiB interval, including minor-collected and major-collected objects. One process runs at a time with below-normal priority 10 while the user uses the PC. Complete document hashes match. Values are estimated allocated bytes per render, not retained memory or exact object counts.

| Fixture | Before execution-target integration | Integrated current build | First props prototype |
| --- | ---: | ---: | ---: |
| 3 incidents | 70,077 | 67,679 | 66,591 |
| 96 incidents | 525,233 | 497,411 | 485,082 |

Both pairs improve for both comparisons and fixture sizes. The preceding-to-integrated comparison confirms the retained source optimization: approximately 3.4% lower allocation for the small page and 5.3% lower for the large page. The first props prototype reduces allocation a further 1.6% and 2.5%, respectively. These results do not establish throughput, GC count or GC duration changes.

## Read-order correction

The first extraction reads `contract.artifact` and `artifact.execution` again inside the helper. The original implementation retains the values selected before props preparation. Although compiler metadata is normally frozen data, freezing alone does not make accessor results stable. There is no reason for this optimization to add metadata reads or move selection across props settlement.

The corrected prototype passes the already selected artifact and execution metadata into the helper, retaining original read order for both ready and pending props. It adds two internal arguments instead of allocating a wrapper. The first prototype's allocation numbers must not be attributed to this revised code before measuring it.

A diagnostic exposes the existing internal executor from each frozen bundle and supplies an artifact getter returning distinct selections on successive reads. This is a read-order probe, not a claim that such hand-authored metadata is a public application API. On both Node and Bun, with ready and promised props:

- the control reads once and renders the first selection;
- the first prototype reads twice and renders the second selection;
- the corrected prototype reads once and renders the first selection.

Both prototypes separately pass 24 complete-output comparisons across Node/Bun string/stream with three concurrent requests per fixture and forced ready-call suspension. Each runtime induces 183/105 small string/stream suspensions and 1,113/663 large suspensions. These probes supplement rather than replace acceptance coverage for props rejection, lifecycle failures, observers and scheduled work.

## Corrected variant response consumption

Sixteen fresh production processes compare the corrected variant against the current integrated build. Each warms 50,000 iterations and measures 20,000 full string renders followed by Response construction and text consumption. Node 26.8.1 and Bun 1.4.2 each run two reversed orders for both fixture sizes. All processes report below-normal priority 10 and run one at a time during active workstation use. Complete document hashes match. The same frozen server bundle is used on both runtimes; these are not HTTP measurements.

Mean microseconds per response-consumption iteration:

| Runtime | Fixture | Current | Corrected prototype | Change |
| --- | --- | ---: | ---: | ---: |
| Node | 3 incidents | 47.62 | 46.57 | -2.2% |
| Bun | 3 incidents | 35.66 | 37.23 | +4.4% |
| Node | 96 incidents | 203.39 | 215.21 | +5.8% |
| Bun | 96 incidents | 273.80 | 268.94 | -1.8% |

Small Node pairs are 45.18 to 45.33 and 50.06 to 47.81, with mixed directions. Small Bun pairs are 35.65 to 37.08 and 35.66 to 37.38, both slower. Large Node pairs are 200.35 to 215.77 and 206.42 to 214.66, both slower. Large Bun pairs are 278.47 to 261.07 and 269.13 to 276.80, with mixed directions. All observations are retained, including the favorable populations. Shared workstation use limits precision, but the repeated regressions in two cases do not support adoption.

At this stage no allocation or GC benefit had been measured for the corrected variant. The first variant's allocation savings did not establish the corrected variant's behavior or compensate for its observed timing regressions. The initial decision was to keep it out of production. The deeper investigation below tests why the apparently useful change failed to improve timing rather than treating that initial result as a sufficient explanation.

## Deeper investigation

The user requested further investigation of promising changes that do not initially help. Three subsequent checks distinguish allocation, optimization behavior and scheduling effects. All use the unchanged corrected prototype and current integrated control.

First, Node optimization traces use `--trace-turbo-inlining`, `--trace-opt` and `--trace-deopt`, with 50,000 warmups and 1,000 additional large-page encoded iterations at below-normal priority. Trace-enabled elapsed times are not performance evidence. The candidate's extracted helper is explicitly inlined into executeDirectSsrComponent and executeSynchronousArtifact. The control's original callback is also inlined. Each trace contains 20 bailout records with matching grouped reasons: nine wrong-map, ten labeled unknown and one insufficient-feedback record. Neither trace reports a bailout for executeDirectSsrComponent, executePreparedDirectComponent or executeSynchronousArtifact. This rules out the simple claim that the helper remains an uninlined call or introduces an obvious executor deoptimization storm. It does not prove that generated machine code, inlining decisions elsewhere or optimization costs are identical.

Second, eight fresh Node allocation populations repeat the 50,000-warmup, 10,000-measured-render, 16 KiB sampling protocol in two reversed orders. Both pairs improve for both fixtures. The corrected variant lowers estimated allocation from 67,337 to 66,158 bytes per small render (1.8%) and from 497,390 to 485,813 bytes per large render (2.3%). Thus its allocation benefit is measured directly, independently of the first prototype. No corrected-variant GC duration benefit is established by this capture.

Third, eight unprofiled populations record process CPU usage around the measured loop alongside elapsed time. These retain reduced priority and the same 50,000 warmups and 20,000 encoded iterations. They focus on large Node and small Bun, the cases with repeated earlier regressions.

| Case | Current mean elapsed, us | Candidate mean elapsed, us | Current process CPU, us/render | Candidate process CPU, us/render |
| --- | ---: | ---: | ---: | ---: |
| Node, 96 incidents | 196.88 | 214.91 | 199.65 | 216.00 |
| Bun, 3 incidents | 35.28 | 35.79 | 46.10 | 47.28 |

Node CPU pairs are 198.50 to 214.05 and 200.80 to 217.95 microseconds per render, both worse. Node elapsed pairs are 195.84 to 210.07 and 197.92 to 219.74, also both worse. The 8.2% higher mean process CPU consumption means lost scheduling time alone does not explain the Node regression. Process CPU sums work across the process's threads and can exceed elapsed time; it is not just renderer-thread time.

Bun elapsed pairs are 34.07 to 35.77 and 36.48 to 35.82, now mixed. Its CPU pairs are 44.55 to 44.55 and 47.65 to 50.00. This follow-up does not establish a stable Bun effect and does not erase the earlier two regressions.

The explanation remains incomplete: the helper is inlined and sampled allocation decreases, yet Node CPU consumption rises. Further investigation should attribute that extra CPU work, including collector work and optimized-code differences, before choosing a redesign. Neither extra argument count nor inlining failure is asserted as the cause without evidence. This experiment remains outside production while that question is open.

## GC and captured-scope investigation

Eight further fresh Node processes compare the corrected extraction with the current build on the 96-incident document, separately measuring plain string return and encoded response consumption. The 50,000 warmups, 20,000 measured iterations, reversed orders and reduced priority are retained. PerformanceObserver records GC events, and process CPU is recorded around the render loop.

For plain strings, collection counts fall from 313/313 to 291/291, but summed GC event durations rise from 74.33/79.12 ms to 94.28/96.68 ms. Mean process CPU rises from 189.48 to 193.33 microseconds per render. For encoded consumption, counts fall from 325/325 to 316/316, while durations are mixed: 113.22/96.77 ms versus 106.19/103.52 ms. Mean encoded CPU is 216.80 versus 211.33 microseconds, opposite the earlier capture's mean direction. The first encoded control population uses 235.15 microseconds of CPU and the second 198.45, demonstrating substantial variation even in process CPU time. Process CPU excludes time a process is not scheduled, but remains sensitive to execution conditions and work on all process threads. Neither these durations nor the earlier CPU comparison proves a universal collector or algorithmic explanation.

A bytecode inspection supplies a narrower structural hypothesis. The extracted prepared-component helper creates a 17-slot function context before its stateless branch. Its captured lifecycle and rollback locals share that scope with the stateless path. This is bytecode evidence, not proof of the final optimized heap representation. A new prototype moves the stateful tail into a separate helper while preserving the stateless branch, selected metadata, publication operations and cleanup behavior. The prepared helper's bytecode context falls from 17 slots to 7 and its bytecode length from 324 to 209. Its reported register frame grows from 64 to 96 bytes, another reason not to equate a smaller closure context with an automatic speedup.

The new split prototype passes 24 full-output suspension comparisons on Node/Bun string/stream. It retains the corrected metadata arguments and does not introduce a second rendering engine. A three-way response-consumption screen compares current, corrected-unsplit and split in two reversed orders for large Node and small Bun. Each process warms 50,000 iterations, measures 20,000 and uses reduced priority during shared-PC use.

| Case | Metric | Current | Corrected unsplit | Split |
| --- | --- | ---: | ---: | ---: |
| Node, 96 incidents | Mean elapsed us/render | 210.15 | 214.01 | 211.95 |
| Node, 96 incidents | Process CPU us/render | 214.85 | 217.60 | 213.68 |
| Bun, 3 incidents | Mean elapsed us/render | 35.95 | 36.19 | 35.65 |
| Bun, 3 incidents | Process CPU us/render | 45.73 | 40.20 | 43.35 |

Node elapsed pairs are current 207.33/212.96, unsplit 214.63/213.39 and split 212.21/211.68. Node CPU pairs are current 213.25/216.45, unsplit 218.75/216.45 and split 214.85/212.50. The split improves against the unsplit extraction in both pairs for both metrics, but has mixed directions against current. Bun elapsed pairs are current 36.09/35.81, unsplit 36.62/35.76 and split 35.79/35.51, with both split pairs improving slightly against current. Bun process CPU is variable and does not rank the variants the same way as elapsed time.

This partially recovers the extraction's cost and provides a concrete captured-scope mechanism to investigate, rather than asserting that callback removal inherently fails. It does not fully explain the earlier regression. The split needs allocation measurement, the other fixture/runtime cases and broader correctness coverage before adoption. The current renderer remains unchanged.

Split prototype SHA-256: `a454621b5c878a28cbf574f54bc8b73d1cb026809ef24f421be9e61c6f13000d`.

## Split-scope allocation and remaining timing checks

Eight allocation populations directly compare the split helper with the current build using the same reduced-priority, 50,000-warmup, 10,000-measured-render sampling method. Both orders improve for both fixtures: mean estimated bytes per render fall from 67,728 to 66,354 on the small page (2.0%) and from 498,028 to 477,942 on the large page (4.0%). This confirms a physical allocation reduction, beyond the earlier bytecode observation. It does not establish that every removed bytecode slot corresponds to a heap allocation in optimized code.

The two previously unmeasured timing cases use another eight fresh processes, retaining 50,000 warmups, 20,000 measured encoded iterations and two reversed orders:

| Case | Current elapsed us/render | Split elapsed us/render | Current CPU us/render | Split CPU us/render |
| --- | ---: | ---: | ---: | ---: |
| Node, 3 incidents | 41.86 | 42.66 | 42.18 | 44.53 |
| Bun, 96 incidents | 285.50 | 278.22 | 362.90 | 353.53 |

Node elapsed pairs are 43.89 to 42.38 and 39.83 to 42.93, with mixed directions. Node CPU pairs are 43.75 to 46.10 and 40.60 to 42.95, both worse. Bun elapsed pairs are 281.29 to 269.12 and 289.72 to 287.31, both better; CPU pairs are 360.15 to 350.00 and 365.65 to 357.05, also both better. Together with the previous two cases, this gives measured allocation benefits and several favorable timings, but not a universal runtime improvement or a resolution of the Node string gap. The split is not adopted yet.

## Isolating the scope change from callback extraction

A narrower prototype preserves the original props callback and only moves its stateful lifecycle tail to a separate helper. It therefore tests the captured-scope hypothesis without also changing the ready-props hot call structure. Original metadata selection remains in place, and the existing stateless and stateful lifecycle operations are preserved. It passes 24 forced-suspension complete-output comparisons across Node/Bun string/stream.

A six-process small-Node encoded screen compares current, the extracted-and-split helper, and the narrower scope-only change in two reversed orders. Mean elapsed times are 45.96, 46.66 and 43.55 microseconds; corresponding process CPU means are 48.05, 49.23 and 44.15. Individual elapsed pairs are current 51.29/40.63, extracted-and-split 51.02/42.30 and scope-only 42.78/44.31. CPU pairs are 54.70/41.40, 54.70/43.75 and 43.00/45.30. The large change between control populations shows substantial variation, and scope-only directions against current are mixed. The favorable mean is not sufficient evidence of a stable speedup.

The raw scope-only screen names the extracted-and-split helper `candidate` and the narrower scope-only variant `split`; entry paths and artifact hashes disambiguate them. The following section completes scope-only allocation measurement and the remaining runtime/fixture cases. No source implementation changed during these captures.

Scope-only prototype SHA-256: `253916df095284a4021d261f31a1ef95822f9ab165d482eceade1c80190c80c0`.

## Scope-only follow-up and CPU placement diagnostic

Eight fresh Node allocation populations measure the narrower scope-only variant directly. Mean estimated bytes per render fall from 67,757 to 66,984 on the small fixture (1.1%) and from 497,661 to 485,052 on the large fixture (2.5%). Both large pairs improve. Small pairs are 68,022 to 66,457 and 67,492 to 67,511; the second is effectively flat with a slight increase. The narrower version retains less of the allocation improvement than the extracted-and-split version.

Twelve additional reduced-priority response-consumption populations cover the remaining cases, with the same 50,000 warmups, 20,000 measured iterations and reversed orders:

| Case | Current elapsed us/render | Scope-only elapsed us/render | Current CPU us/render | Scope-only CPU us/render |
| --- | ---: | ---: | ---: | ---: |
| Node, 96 incidents | 212.24 | 214.78 | 217.60 | 215.23 |
| Bun, 3 incidents | 35.94 | 36.22 | 39.08 | 44.53 |
| Bun, 96 incidents | 269.93 | 264.34 | 349.23 | 359.40 |

Large Node elapsed pairs are 199.66 to 217.26 and 224.81 to 212.30, with mixed directions. CPU pairs are 203.15 to 217.95 and 232.05 to 212.50, also mixed. Small Bun elapsed pairs are 35.05 to 36.23 and 36.84 to 36.20; CPU pairs are 38.30 to 46.05 and 39.85 to 43.00. Large Bun elapsed pairs are 272.91 to 267.54 and 266.94 to 261.14, both improving; CPU pairs are 333.60 to 343.75 and 364.85 to 375.05, both increasing. The CPU and elapsed-time tradeoffs remain unresolved, and lower allocation alone is not treated as proof of a better implementation.

The machine reports an AMD Ryzen 7 8745HS with eight cores and sixteen logical processors. A four-process diagnostic restricts only the benchmark workers to logical CPU 14, affinity mask 16,384, before warmup; all retain below-normal priority. Workers wait for their parent to set and verify affinity before importing the participant and starting the workload. No user process or persistent machine setting is changed. The same large-Node encoded workload is used. This diagnostic restricts process threads and is not a normal deployment or HTTP benchmark.

Fixed-affinity elapsed pairs are 200.36 to 209.97 and 213.73 to 205.62 microseconds, with mixed directions. CPU pairs are 197.65 to 208.60 and 210.90 to 204.70. Means are current/scope-only 207.04/207.80 elapsed and 204.28/206.65 CPU. Pinning does not produce a stable direction or eliminate variation; it does not establish CPU placement as the cause of the earlier results. The experiment removes one possible source of variation without resolving the complete explanation.

The investigation has now separated callback extraction, metadata selection, captured-scope size, sampled allocation, GC observations, process CPU and CPU placement. It establishes real allocation reductions, but no consistent Node timing improvement across this family. Keep the current renderer, retain the evidence and prioritize a fresh current-versus-React HTTP comparison before further changes to this execution family.

## Implementation status and evidence

Keep the current integrated renderer. None of these prototypes changed production source or compiler ABI. The retained execution-target optimization's independently confirmed allocation improvement remains intact. Current Node/Bun HTTP adapter comparisons against React are still needed independently of this investigation.

Preceding control SHA-256: `6d92194f2ee395f4e4e5267b8719bc1160a96ce7bc16f1a6bbdc74f98aba4997`.

Current integrated SHA-256: `2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.

First prototype SHA-256: `0db2388cc9aa4d3f6b56c6a27eafe4b03ccb110dd1aca0242b6b302948df514f`.

Corrected prototype SHA-256: `99f76e4e06e41960c5a6da7a1a6669e197051160e5987f5ba6eefb17cbd9d3ba`.

`ready-props-execution-2026-09-10-evidence.zip` preserves the four frozen bundles, asserted builders, allocation driver and worker, twelve heap profiles and summary, suspension and metadata probes/results, relevant source snapshots and this report. The preceding integrated optimization's performance confirmation is now available; the overall Node string and HTTP comparison work remains unfinished.

`ready-props-execution-2026-09-10-timing-evidence.zip` preserves all sixteen corrected-variant timing populations, the driver and worker, both compared bundles, fixture data and this updated decision. The earlier archive remains an unchanged snapshot from before these measurements.

`ready-props-execution-2026-09-10-diagnostic-evidence.zip` preserves optimization traces and their runner, corrected-variant allocation profiles and summaries, CPU/elapsed-time populations and workers, both bundles, fixture data and the updated investigation report.

`ready-props-execution-2026-09-10-scope-evidence.zip` preserves GC/CPU populations and runners, bytecode captures and their short worker, the split construction script and bundle, suspension probes/results, the twelve-population three-way comparison, both controls, fixture data and this updated report. Earlier archives remain unchanged snapshots.

`ready-props-execution-2026-09-10-scope-followup-evidence.zip` adds the eight split allocation profiles and summary, remaining split timing populations, scope-only builder/bundle and suspension probes, its six-process screen, relevant workers, controls, fixture and updated report.

`ready-props-execution-2026-09-10-scope-only-evidence.zip` preserves scope-only allocation profiles, remaining timing populations, affinity diagnostic and worker, raw summaries, both bundles, fixture data and the updated report. Each owned benchmark process exited; production was not changed.
