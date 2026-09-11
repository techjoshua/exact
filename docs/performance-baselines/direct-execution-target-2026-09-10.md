# Direct component execution as a render target

Status: integrated and correctness-validated. A subsequent allocation capture confirms lower allocation in the integrated build, and a focused comparison against React measures its current response-consumption performance. Fresh HTTP comparisons remain pending. The overall React throughput goal remains unmet.

## Hypothesis and ownership

The integrated operation-target change removes two closures around nested prepared programs. Direct component content still enters `renderDirectSsrContent`, which creates two forwarding closures. Its caller also creates a sibling-preparation closure. These survive the preceding change because direct components use the callback form of the same writer.

Each artifact execution already has a request-local execution object, allocated by `renderServerComponentArtifactOutput`. The prototype retains the actual render owner on that object and gives it shared child-rendering and sibling-preparation methods. `renderDirectSsrContent` passes the execution object into the existing target-capable writer. Three closure constructions per direct content call are removed, at the cost of three fields on the existing execution object. No additional wrapper, separate renderer, sink mode branch or WeakMap lookup is added to the candidate. The publication callback is unchanged, so this is distinct from the earlier rejected publication-receiver experiment.

Before performance measurement, the working expectation is a small allocation reduction, roughly 1-4% on these component-heavy fixtures, with a possible 0-3% timing benefit. Those are hypotheses, not measurements. The added fields and indirect dispatch could offset savings or regress either runtime.

Ownership follows source control flow: each recursive artifact execution creates a distinct execution object. Synchronous component content receives the selected owner from component preparation. Scheduled attempts reuse their scheduled component's owner, and `writeScheduledFrame` awaits a candidate's output before retrying. Per-program preparation remains on the writer output. A shared mutable request-global owner would be unsafe; this prototype does not introduce one.

The source integration would still need an explicit internal contract for binding the render owner. Merely asserting that all observed owners match is not enough to establish correctness for every enhancement, task, observer and error path.

## Focused probes

The frozen integrated build is the control. Three requests with distinct titles run concurrently for each small/large fixture and string/stream mode under both Node and Bun. Instrumentation makes every third ready call suspend in StringProgramSink and CapturedProgramSink. All 24 complete-output comparisons pass, preserving application-owned documents, hydration data and four asset tags.

| Fixture | Mode | Requests per runtime | Induced suspensions | Execution objects | Direct content calls |
| --- | --- | ---: | ---: | ---: | ---: |
| 3 incidents | String | 3 | 183 | 24 | 24 |
| 3 incidents | Stream | 3 | 105 | 24 | 24 |
| 96 incidents | String | 3 | 1,113 | 303 | 303 |
| 96 incidents | Stream | 3 | 663 | 303 | 303 |

Both runtimes have the same counts. Thus these fixtures exercise 8 and 101 direct content calls per request. Source-level closure constructions removed are 24 and 303 per request. This does not measure how many closures the engine actually allocates after optimization or how many bytes they occupy.

Diagnostic-only instrumentation also tracks execution-to-owner associations with a WeakMap and rejects changes. It observes no changes, but the call counts show one content call per execution in these fixtures. Consequently this probe does not exercise scheduled retries or prove their owner stability. The diagnostic WeakMap exists only in the pressure entry, not the candidate bundle used for future performance tests.

No runtime source changed. Broad package/browser acceptance, scheduled retries, enhancement rejection, observer and cleanup cases remain required if performance results justify integration. Prior integrated package-content, release-ABI, explicit-any and platform-boundary checks were separately recovered by successful reruns; they do not validate this prototype.

## Allocation and GC follow-up

Measurements use Node 26.8.1 production processes, one at a time, at below-normal priority (reported as 10). The user is using the workstation. Each population warms 50,000 renders in a fresh process. Allocation sampling then measures 10,000 renders at a 16 KiB interval, including objects collected by minor and major GC. Two reversed orders cover all three variants. These are estimated JavaScript heap allocations, not exact object counts or retained memory. All complete output hashes match.

| Fixture | Preceding build bytes/render | Integrated target bytes/render | New prototype bytes/render | Prototype reduction from integrated |
| --- | ---: | ---: | ---: | ---: |
| 3 incidents | 71,942 | 69,773 | 67,440 | 3.3% |
| 96 incidents | 540,419 | 524,827 | 498,504 | 5.0% |

Both pairs improve in both comparisons for both fixtures. Integrated-to-prototype small pairs are 69,372 to 67,162 and 70,174 to 67,718. Large pairs are 525,321 to 497,443 and 524,333 to 499,566. The preceding-to-integrated comparison independently confirms the retained source change: 3.0% less allocation on the small page and 2.9% less on the large page.

Separate processes then observe GC events over 20,000 renders, again after 50,000 warmups and in two reversed orders. All observed events have kind 1 (minor GC). The observer counts events that start inside the measured interval; it does not force a full collection.

| Fixture | Integrated collection counts | Prototype collection counts | Integrated event durations, ms | Prototype event durations, ms |
| --- | --- | --- | --- | --- |
| 3 incidents | 83 / 83 | 81 / 80 | 19.00 / 19.10 | 17.17 / 19.41 |
| 96 incidents | 314 / 314 | 313 / 313 | 115.01 / 103.17 | 80.28 / 86.09 |

Small-page collections fall modestly; large-page counts are nearly unchanged despite the allocation reduction. The observed GC durations are elapsed event time, not isolated collector CPU time. Workstation contention and reduced scheduling priority limit their interpretation. Small-page duration directions are mixed. Both large-page durations are lower, but this is not proof of equivalent throughput improvement. Raw elapsed render times are preserved for transparency and are not used for performance claims.

The allocation result warranted the response-consumption screen below. It does not by itself justify adopting the prototype without broader lifecycle coverage and checking for runtime regressions. No new runtime source changes were made in this follow-up.

## Response-consumption follow-up

Sixteen fresh production processes compare the integrated build and prototype on Node 26.8.1 and Bun 1.4.2. Each warms 50,000 iterations and measures 20,000, rendering a complete string, constructing a Response and awaiting its text consumption each time. Both orders run for both fixture sizes and runtimes. One process runs at a time, all report below-normal priority 10, and the user is actively using the PC. These conditions make the observations a regression screen rather than a replacement benchmark baseline. Both runtimes use the same frozen server bundle; this is not an HTTP adapter test. Complete document hashes and all four asset tags match.

Mean microseconds per complete iteration:

| Runtime | Fixture | Integrated | Prototype | Mean change |
| --- | --- | ---: | ---: | ---: |
| Node | 3 incidents | 50.29 | 45.77 | -9.0% |
| Bun | 3 incidents | 35.15 | 34.13 | -2.9% |
| Node | 96 incidents | 221.01 | 199.07 | -9.9% |
| Bun | 96 incidents | 278.88 | 277.62 | -0.5% |

Small Node pairs are 58.81 to 41.98 and 41.78 to 49.56, with substantial variation and mixed directions. Small Bun pairs are 34.77 to 35.33 and 35.52 to 32.94, also mixed. Large Node pairs are 233.07 to 208.15 and 208.95 to 190.00, both improving. Large Bun pairs are 279.97 to 281.24 and 277.78 to 274.00, mixed and nearly flat on average. The positive means do not erase the individual regressions or establish universal improvements.

The repeated allocation reduction, modest collection-count reduction, large-Node timing evidence and near-flat large-Bun screen justify proceeding to source integration for full validation. That next step must preserve execution-local owner binding, scheduled retry ordering, enhancement rejection, observer behavior and cleanup. It must also rebuild the applications and compare the actual integrated artifacts before attributing these prototype numbers to them. The overall React throughput goal remains unproven, and no React throughput measurement was made in this screen.

## Source integration and validation

The shared artifact-execution contract now carries the selected render owner and the two shared program-target methods. Direct content binds the owner before traversal and passes the existing execution into the same writer. Synchronous and scheduled call sites no longer construct the three forwarding closures. Existing publication, enhancement, task, rollback and disposal control flow remains intact. Each child artifact still receives its own execution object. No public sink interface, compiler helper signature or artifact semantics changed, and no obsolete compatibility implementation was retained.

Two new integration cases render concurrent trees with nested component-context providers. Every sink ready call suspends; one case also rejects the left request after nested output. The tests verify correct parent/nested context values after resumed traversal, independent completion of the right request, propagation of the original sink failure, empty host stacks and balanced acquisition/disposal records. Existing package coverage additionally exercises scheduled work, publication failure, cancellation and enhancement output.

Validation passed:

- SSR package build and comparison client, Node server and Bun server rebuilds;
- test typechecking and all 360 SSR tests in 57 files, with two test workers;
- targeted formatting and ESLint, architecture and JSDoc checks;
- frozen 0.5.0 client-task, reactive-update, keyed-identity, SSR, hydration and disposal checks;
- 56 browser checks across Node/Bun string/stream, covering both frameworks;
- 24 integrated forced-suspension full-output comparisons against the preceding frozen build;
- package contents, release ABI (epoch 1 at 0.5.0), explicit-any (73/73) and all configured platform boundaries.

The test runner emitted plugin-timing and MaxListenersExceeded warnings while preparing fixtures; no assertion or process failed. Frozen ABI fixtures were not regenerated. Engineering ownership documentation was updated. Public application behavior and setup are unchanged, so public docs and package READMEs did not need edits.

Integrated Node SHA-256: `2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.

Integrated Bun SHA-256: `9adc04f4d5d6e78ad95730319a475918c3b4b045da9a93f812c81aa827d60d2e`.

The measurements above identify the prototype artifact explicitly and must not be relabeled as measurements of these integrated artifacts. Source integration moved shared methods to the artifact execution module and migrated internal types and callers. Subsequent [allocation captures](ready-props-execution-2026-09-10.md) independently confirm approximately 3.4% lower allocation on the small page and 5.3% lower on the large page against the preceding integrated target build. A [focused comparison with React](direct-execution-react-2026-09-10.md) measures the current source integration directly. Fresh HTTP comparisons remain necessary.

## Evidence snapshots

Control SHA-256: `6d92194f2ee395f4e4e5267b8719bc1160a96ce7bc16f1a6bbdc74f98aba4997`.

Candidate SHA-256: `b4df40493dea5ac6172ffdf8a1d4511face4212852eeb60894d218abce544078`.

`direct-execution-target-2026-09-10-evidence.zip` preserves the asserted builder, control and prototype bundles, pressure runner and instrumented entry, both result files, fixture data, relevant source snapshots and reports from the initial experiment. At its creation, production remained the preceding operation-target build. No new claim about the gap to React is supported by these correctness probes.

`direct-execution-target-2026-09-10-allocation-evidence.zip` adds all twelve allocation profiles, eight GC populations, raw JSON summaries, reduced-priority workers and drivers, the three frozen builds, fixture data and updated reports. All capture processes exited, and a process check found only the user's Codex Node process remaining.

`direct-execution-target-2026-09-10-timing-evidence.zip` preserves all sixteen timing populations, the reduced-priority driver and worker, the original worker used to construct it, both frozen bundles, fixture data and this updated report. Earlier archives remain unchanged snapshots of the evidence available when created.

`direct-execution-target-2026-09-10-integration-evidence.zip` preserves the integrated source and new regression fixture/tests, updated engineering documentation, both server artifacts, the preceding control, browser logs, integrated suspension probes/results and this report.
