# Component-local target ABI performance ledger

This ledger records the accepted phase checkpoints required by the
[component-local target ABI implementation plan](../proposals/component-local-target-abi-implementation-plan.md).
Machine-readable evidence lives in the adjacent `component-local-target-abi` directory. Raw or
invalid attempts remain under `.tmp/component-local-target-abi` and never enter this ledger.

## Checkpoints

| Phase | Revision                     | Status   | Correctness gate | Structural gate | Environment            | Result artifact                                                                                   |
| ----- | ---------------------------- | -------- | ---------------- | --------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| P0    | `40aaa84` + patch `37854855` | accepted | passed           | passed          | `windows-2026-08-26-a` | [JSON](component-local-target-abi/phase-0.json) / [tables](component-local-target-abi/phase-0.md) |
| P1    | `40aaa84` + patch `eebe4ad6` | accepted | passed           | passed          | `windows-2026-08-26-a` | [JSON](component-local-target-abi/phase-1.json) / [tables](component-local-target-abi/phase-1.md) |
| P2    | `40aaa84` + patch `d0168266` | accepted | passed           | passed          | `windows-2026-08-26-a` | [JSON](component-local-target-abi/phase-2.json) / [tables](component-local-target-abi/phase-2.md) |
| P3    | `40aaa84` + patch `e741135f` | accepted | passed           | passed          | `windows-2026-08-26-a` | [JSON](component-local-target-abi/phase-3.json) / [tables](component-local-target-abi/phase-3.md) |
| P4    | `40aaa84` + patch `49b0372c` | accepted | passed           | passed          | `windows-2026-08-26-a` | [JSON](component-local-target-abi/phase-4.json) / [tables](component-local-target-abi/phase-4.md) |
| P5    | `40aaa84` + patch `68c923bd` | accepted | passed           | passed          | `windows-2026-08-26-a` | [JSON](component-local-target-abi/phase-5.json) / [tables](component-local-target-abi/phase-5.md) |
| P6    | `40aaa84`                    | accepted | passed           | passed          | `windows-2026-08-26-a` | [JSON](component-local-target-abi/phase-6.json) / [tables](component-local-target-abi/phase-6.md) |
| P7    | `40aaa84` + patch `96ba3106` | accepted | passed           | passed          | `windows-2026-08-26-a` | [JSON](component-local-target-abi/phase-7.json) / [tables](component-local-target-abi/phase-7.md) |
| P8    | `40aaa84` + patch `9256eae5` | accepted | passed           | passed          | `windows-2026-08-26-a` | [JSON](component-local-target-abi/phase-8.json) / [tables](component-local-target-abi/phase-8.md) |
| P9    | `40aaa84` + patch `5ea13353` | accepted | passed           | passed          | `windows-2026-08-26-a` | [JSON](component-local-target-abi/phase-9.json) / [tables](component-local-target-abi/phase-9.md) |

Phase 0 established the structural schema, compiler-owned artifact inventory,
corpus aggregation, complete participant/percentile validation, control-framework normalization,
materiality rules, and deterministic report generation. The repository correctness and performance
suites passed. The controlled
browser, startup-CPU, Node SSR, and Bun SSR runs passed their correctness and evidence-completeness
gates. The comparison harness correctly marks them non-publishable while its participant reviews
remain incomplete; that publication status is retained in the checkpoint but is not an ABI phase
gate. ABI checkpoint acceptance depends on the proposal's correctness, structural, environment,
and complete-suite requirements. The accepted result contains 89 suites. Twenty-eight comparison
suites retain `non-publishable` source status; all remain eligible as ABI engineering evidence.
The isolated internal performance profile passed and its captured result validates as 61 exact-only
suites containing 246 complete metrics and 246 corresponding raw populations. Phase 0 is an
observability baseline, not an architectural performance-improvement claim.

Phase 1 replaced the version-2 composed definition with one current executable artifact selected
by physical target, separated inert build facts from executable contracts, and moved recursive
validation out of prepared runtime reads. All 89 suites and the repository acceptance surface
passed. The declared temporary representation cost appeared in the production fixtures: the
internal client artifact grew by 6,817 raw bytes (1,214 gzip and 926 Brotli), the server artifact by
5,999 raw bytes (1,228 gzip and 927 Brotli), and the direct SSR artifact by 1,936 raw bytes (398 gzip
and 322 Brotli). Phase 2 owns removal of that duplicate/generic execution weight.

No stable runtime regression was attributed to the Phase 1 implementation. The controlled browser
settlement median improved by 3.1% while its single upper-tail observation crossed the 10% summary
threshold; the unchanged semantic assertions and opposing median/p75 direction identify that row as
seven-sample tail dispersion, not a shifted settlement path. At Node saturation 64, the normalized
process-CPU counter increased by 0.0717 ms/request while throughput changed by -0.5%, worker CPU was
unchanged, and process system CPU decreased. The counter is quantized from one process aggregate
over the request population and does not identify additional target-ABI work. Both movements remain
visible in the complete tables. The separately observed synchronous SSR regression was traced to a
duplicate prepared-contract read, removed, and the full correctness and performance gates were
rerun before this checkpoint was accepted.

Phase 2 moved native client construction, attachment, indexed prop receipt, and disposal behind
the referenced client artifact. Parents no longer carry child dirty masks or route child
operations: the corpus reports `parentOwnedChildDirtyRouting: 0`. Receipt publishes final slot
values once, and the receiver owns comparison, absence, dirtiness, and one atomic apply. Native
dispatch no longer enters the DOM renderer's generic function-component lane; compiler-selected
focused structural ranges remain for Phase 3. The full repository admission gate and all 89
performance suites passed. The canonical Phase 2 tables retain every framework, metric, raw
population, and p50/p75/p95/p99 value for browser, startup CPU, Node SSR, Bun SSR, and internal
performance lanes.

The Phase 2 prediction was only structurally successful. Client transfer and decoded script grew
by 4,422 bytes (2.1%) versus P1; executed code grew by 1,591 bytes (1.9%), invoked functions by 13
(2.0%), and profiled functions by 31 (2.6%). Direct ABI code is present while the exhaustive
interior and generic mount paths remain reachable, so Phases 3, 4, and 8 own removal of this tracked
duplicate weight. Node post-run heap used also increased by 2,552,912 normalized bytes (19.5%),
Node concurrent process user CPU by 0.265 ms/request (24.6%), and Bun saturation-64 p50/p75 latency
by 16.4%/10.3% after control normalization. Those server movements contradicted the declared
stable area: early shared target-artifact and request-frame plumbing had moved while the generic
server lane remained. Response identity and byte counts remained exact. Phase 5 must replace that
lane, and Phase 8 must remove the duplicate infrastructure. The complete report records these as
unexpected regressions rather than claiming a Phase 2 performance win.

Materiality was fixed before later-phase measurements: timing movement below 10% is treated as
indistinguishable from the observed local-run dispersion, deterministic size movement is material
at one byte, and retained-memory movement is material at 1 MiB. These thresholds affect the short
summary only; every measured value remains in the full checkpoint tables.

Phase 3 completed focused lowering for every valid native component interior in the measured
corpus. Across 301 files in 23 projects, all 366 native components and 346 target artifacts now
report zero declined native JSX regions, zero generic native binding groups, and zero
fallback-bearing artifacts. The repository admission gate, all 28 comparison scenarios, Theme Lab,
router v6.3, corpus validation, and all 89 performance suites passed from the accepted state.

The predicted reachability improvement remains deferred rather than claimed. Compared with P2, the
controlled client artifact increased by 1,410 raw/decoded bytes (437 gzip and 345 Brotli), executed
code by 597 bytes, invoked functions by five, and profiled functions by six. The focused programs
now cover the complete source surface, but 594 generic native renderer imports remain reachable;
Phase 4 owns attachment specialization and Phase 8 owns removal of that superseded runtime surface.
Shared artifact support also added 946 raw server bytes (125 gzip, 110 Node Brotli, and 74 Bun
Brotli), which remains assigned to the Phase 5 and Phase 8 removals.

Bun startup recorded one 289.4 ms upper-tail sample while its median improved by 2.3%. Bun
concurrent/saturation tails moved upward while Node concurrent/saturation-1 moved strongly in the
opposite direction. Response identities and byte counts stayed exact, server issuance did not
change in this client-focused phase, and control confidence for the affected rows is low or
unavailable. The checkpoint therefore retains those populations as stable-area dispersion rather
than attributing them to Phase 3. One 22.89 ms keyed-identical reactive observation and
sub-millisecond browser ratios are similarly retained as scheduler/timer outliers; neither shifts
its central path.

Phase 4 routes matching native root and nested-component hydration through the same artifact
attachment method used for client-only mount. The DOM hydration target supplies only a cursor and
ownership callbacks: it does not classify what crosses the component boundary. Generated claims
adopt matching output directly, while claim failure retires the candidate and invokes the same
artifact in mount mode. Root-hydration regression coverage proves both the successful hydrate call
and the `hydrate`, then `mount` recovery sequence. Chromium hydration remained exactly 0.1 ms at
every reported percentile and two measured operations; Node and Bun server artifacts were
byte-identical to Phase 3.

The checkpoint also records the remaining transition cost rather than hiding it. The eXact client
artifact grew by 1,277 raw/decoded bytes, 164 gzip bytes, and 176 Brotli bytes; executed code grew by
681 bytes and seven invoked functions. The specialized hydration target remains reachable beside
generic adoption code, and the comparison fixture retained 40 comments and 182 nodes. Phase 8 owns
removing that duplicate path and consolidating protected marker handling after focus, dirty-control,
mismatch, and disposal behavior is secured. Node hydration p95/p99 rose 0.0481 ms (+15.6%) across
five process samples while the median moved only 1.9%, so the timer-scale tail remains visible but
is not attributed to a changed central path.

Node concurrent SSR slowed while Bun concurrent SSR improved in the opposite direction, despite
byte-identical server artifacts. Those low-confidence distributions are retained as stable-area
dispersion. The 289 ms Bun startup tail observed in Phase 3 disappeared, confirming that it was an
environmental outlier. Retention slopes remained zero or negative and absolute heap movement stayed
below the 1 MiB materiality threshold.

Phase 5 moved supported Node and Bun SSR onto request-local artifact issuance, ordered writing, and
idempotent disposal. Imported children, scheduled work, resumptions, continuation contexts, and
executor dispatch use the same target-local server ABI. The corpus reports zero generic native SSR
imports and zero runtime-created native artifacts, and response identity remained exact. Compared
with P4, raw eXact Node sequential p50 total improved 20.5%, Node concurrent p50 throughput rose
17.8%, Bun sequential p50 total improved 8.7%, and Bun concurrent p50 total was effectively flat
at -0.4%. Client artifacts, DOM counts, heap, authored complexity, and transferred/decoded script
bytes were unchanged.

The accepted checkpoint retains the transition costs and contrary movements. The eXact Node and
Bun server artifacts each grew by 2,176 raw bytes because the new executor remains reachable beside
code assigned to Phase 8 removal. Node saturation-64 normalized p95 total and TTFB increased about
30.5%, saturation-32 normalized p50 throughput decreased 11.3%, and concurrent GC duration rose to
5.43 ms for the complete workload. Bun concurrent CPU counters fell much more than its flat wall
time, so their coarse quantization is recorded without claiming proportional execution savings.
The complete P5 tables contain every framework, metric, population, and percentile used by this
analysis.

Phase 6 makes finite registries select already compiled target-local artifacts. Eager entries reuse
the selected artifact, lazy client and server entries preserve registry-key identity and generation
fencing, and no selection path classifies native component kind or chooses an execution lane at
runtime. The full release gate passed; the framework-comparison application does not exercise a
registry, so its client, Node, and Bun artifacts remained byte-identical to P5.

The complete P6 tables retain the observed environment variance. Browser DCL improved while
frame-quantized FCP/LCP moved in the opposite direction; adjacent Node saturation lanes alternated
between improvements and regressions; and Bun sequential latency rose while concurrent results
remained ahead of the controls. With identical measured artifacts, unchanged response identities,
and bounded retention slopes, those contradictory movements were not attributed to registry
selection.

Phase 7 publishes target-local executables and inert protocol-2 package facts, automatically
classifies imported React packages into fixed compatibility islands, and carries native children
through React ownership as opaque supplier operations. The mixed compatibility fixture shrank by
72,050 raw client bytes (11.9%) and 170,913 raw server bytes (28.6%). Fixed React island and root
artifacts pass React 18/19, hydration, package-publication, reconciler, and R3F coverage, while
runtime-created native artifacts remain zero and native contribution handles expose no topology or
VNode materialization.

The accepted checkpoint retains its transition costs. The native-only controlled client artifact
grew by 593 raw bytes (+172 gzip, +106 Brotli), and the Node and Bun server artifacts each grew by
2,253 raw bytes (about 1.1%). The retained generic renderer still recognizes the explicit opaque
compatibility capability; Phase 8 owns removing that reachability. Normalized Node p50 latency also
moved upward in the sequential, concurrent, and saturation-4 lanes, but adjacent Node lanes and Bun
did not show a coherent cross-runtime cost. Broad exact-only timing slowdowns, including unchanged
reactive and pure-React reference work, contrasted with a controlled clean-build normalization of
only +0.5%; the report therefore records the wider timing movement as a slower host measurement
state rather than attributing it to Phase 7 semantics. Every framework, metric, percentile, and raw
population remains in the complete P7 tables.

Phase 8 removes native generic construction, rendering, rerendering, binding, server execution,
fallback artifacts, and runtime artifact factories. All seven structural fallback counters are
zero, and the release, Router, Theme Lab, native corpus, React compatibility, browser, Node, and Bun
acceptance surfaces pass. The controlled eXact client artifact shrank 8.6% raw, 5.8% gzip, and 5.2%
Brotli from P7; it is also smaller than P0. Decoded and profiled JavaScript fell 8.8%, and executed
code fell 6.1% after control normalization.

The accepted checkpoint also records contrary movement rather than hiding it. The compiler-closed
direct-server fixture grew 49.6% raw and 37.9% Brotli because the corrected scheduled-component
path retains the focused async operation target, direct scheduler, server component ABI executor,
task execution, and render-program modules. A preserve-modules audit found no generic renderer,
VNode path, or compatibility module in that graph; controlled Node and Bun server artifacts show a
smaller 4.6-4.7% raw and 1.5-2.0% compressed application cost. The broad internal client fixture
grew 9.9% raw from P7 as it acquired the correct durable keyed-list program and cache, but remains
below P0 while the controlled application shrank, confirming that unused capabilities are removed.

Earlier Phase 8 keyed-mutation measurements are excluded because they discarded the authored
mutation. Correct measurements retain unchanged item programs and reconstruct genuine replacement
items. The first controlled SSR capture is likewise retained only as a rejected attempt because
Bun/React saturation 1 reported no event-loop histogram observation; the harness now waits for a
bounded first observation and the full track was rerun successfully. Bun concurrent variance,
server artifact size, dense synthetic SSR setup cost, keyed replacement cost, and 6x p95 script
time carry into Phase 9's 50-sample confirmation. Every framework, metric, percentile, and raw
population remains in the complete P8 tables.

Phase 9 completed the proposal with the full repository acceptance surface, fresh native DOM and SSR
reachability audits, 50-sample browser and 1x/4x/6x startup populations, and the complete Node and Bun
SSR matrix. All seven forbidden native fallback counters remain zero. The controlled client artifact
is byte-identical to P8 and remains 4.2% smaller raw, 1.9% smaller gzip, and 1.3% smaller Brotli than
P0. The controlled Node and Bun server artifacts are also byte-identical to P8; their focused ABI cost
remains 9.4% and 9.2% raw above P0 respectively, with no generic SSR renderer, VNode path, or
compatibility module reachable.

The 50-sample matrix retains every contrary result. Bun concurrent throughput is 19.1% lower at p50
and 25.3% lower at p95 after P8 control normalization, although p95 worker completion improves and
eXact remains competitive at concurrency 16 and leads React and Nuxt at 32 and 64. Bun saturation 8
has an isolated low-confidence p95 TTFB tail. Throttled startup retains low-confidence 4x p95
compile/parse/script regressions and 6x p99 compile/evaluation/readiness/task regressions; the P8 6x
p95 script regression does not reproduce. Browser response-header, settlement, and SSE p95 timings
also move upward while feedback improves and all response identities and behavioral scenarios remain
unchanged. These results are accepted as measured runtime, transport, and tail variance rather than
attributed to removed generic execution.

The first P9 SSR capture was rejected because Bun/SvelteKit's `node-http-compat` saturation-1 lane
recorded no event-loop histogram observation. The bounded Bun reset gate had covered native Fetch but
not the compatibility transport. Both reset handlers now require a real observation, the harness
contract suite passes, and the entire SSR matrix was rerun successfully. The complete P9 report records
the accepted capture and all p50/p75/p95/p99 values; the rejected capture remains outside the ledger.

The repository generator is
[`scripts/component-local-target-abi/generate-report.mjs`](../../scripts/component-local-target-abi/generate-report.mjs).
It accepts one JSON configuration path, validates the candidate and every baseline as accepted
checkpoints, rejects missing suites or controls, derives all normalized comparison rows, and writes
the canonical JSON and complete Markdown report named by `outputJson` and `outputMarkdown`. Its
configuration must include `checkpoint`, `expectedSuites`, `controlsBySuite`, and any `baselines`;
deterministic metric inventories may be supplied through `deterministicMetricsBySuite`.
Artifact and transferred bytes, DOM shape, response size, code-coverage bytes, and V8 function
inventory are intrinsically deterministic in the comparison implementation and remain raw even if a
report configuration does not repeat them. Configuration extends this built-in inventory; it does
not replace it.
When `frameworkComparison` names the `browser`, `startupCpu`, and `ssr` raw-result paths, the
generator requires their correctness gates and complete evidence to pass, retains their independent
comparison-publication status, and separates different sample populations into auditable suites
automatically. Framework-specialist review controls publication by the comparison project; it does
not control ABI phase progression.
When `internalPerformance` names the captured `performance:check` output, the generator requires
every reactive, DOM-list, framework client/server, compiler, theme, DevTools, and React-reference
marker and converts the complete produced metric inventory into exact-only suites. Those rows retain
raw history but deliberately receive no control-framework normalization.
Accepted report configurations must name immutable, phase-specific captures. The generator rejects
the mutable `.tmp/release-performance-output.json` target so regenerating a historical report cannot
silently substitute a later phase's measurements.

## Post-acceptance specialization work

The accepted ABI exposed remaining target-local overhead without reopening any generic native
execution path. The following optimization checkpoints retain the proposal's correctness,
structural, measurement, normalization, and complete-table requirements. They begin from the
accepted Phase 9 implementation and do not rewrite its historical evidence.

### S1: compiler-closed server serialization

Implemented mechanisms:

- fold compiler-known static intrinsic attributes into server literal segments and omit
  client-only properties from server values;
- let generated server programs append directly to a request-owned bounded output sink instead of
  allocating an intermediate segment array; and
- route compiler-proven text, child, keyed-child, and component slots directly without entering
  generic child classification.

The Node allocation profile identifies `renderAttribute`, property-descriptor reads, array joining,
output charging, render-program flattening, and generic child traversal as the principal affected
sites. Node render-only allocation, sequential/concurrent CPU, latency, throughput, and server
artifact size are expected to improve. Response identity, byte counts, task order, cancellation,
retention, hydration topology, browser metrics, client artifacts, client function inventory, and
client heap are expected to remain unchanged. Bun results remain an eXact native-transport trend and
must not be interpreted as a cross-framework ranking while the control participants use Bun's
`node:http` compatibility transport.

### S2: compact client programs and root capability closure

Implemented mechanisms:

- replace compiler-generated structural claim/binding closures with component-local immutable
  descriptors consumed by focused DOM claim and binding operations; arbitrary authored value
  expressions remain executable functions; and
- have the build adapter join compiler-emitted root capability facts with each bundler entry and
  emit a capability-closed hydration bootstrap, discarding descriptive build inventories.

Parsed, compiled, profiled, and invoked functions, evaluation time, decoded/executed bytes, client
artifact size, and startup heap are expected to improve. Navigation, paint, DOM identity, hydration
recovery, interaction settlement, protocol output, SSR behavior, and server artifacts are expected
to remain stable. Module-owned descriptor bytes and retained heap are counter-metrics; no descriptor
may be allocated per component instance or become an application-wide render interpreter.

### S3: static resumption publication

Prepared component contracts now cache immutable resumption schemas and operation tables while
SSR retains only request-specific values and identities. Hydration payload validation, escaping,
authorization, limits, and request isolation remain unchanged. SSR allocation, publication CPU,
payload size, and server artifact size are expected to improve or remain stable; client startup and
heap must not regress from eagerly materializing unused resumption metadata.

### S1-S3 comparison checkpoint

The combined post-acceptance checkpoint ran the release prerequisite once, then invoked the
performance profile without repeating that prerequisite. The release surface passed 1,930 tests
with five skips; the framework-comparison correctness run passed all 28 browser scenarios. The
native corpus rerun passed its aggregate and per-project guards, and all proposal structural
counters remained zero.

The compiler now emits one immutable `wire` tuple per client render program rather than generated
claim and binding helpers. The DOM runtime interprets only those focused, compiler-selected
operations. The build adapter closes hydration capabilities over each resolved entry graph and
emits executable bootstrap imports; descriptive graph facts do not survive as a runtime inventory.
Microfrontend shared-package closure includes those compiler-emitted narrow runtime capabilities,
so a remote cannot accidentally bundle a second local framework runtime. Server programs write
compiler-proven static and dynamic output to the bounded request sink, and prepared contracts share
immutable resumption schemas without retaining request values.

Deterministic client results support the representation change but expose its counter-cost. Parsed,
compiled, profiled, and invoked function counts changed from 781/797/1,181/577 to
776/791/1,172/571. Executed code increased 973 bytes (1.0%), the raw/gzip/Brotli client artifact
increased 872/370/294 bytes, and retained browser heap increased 17,492 bytes (0.7%). The diagnostic
startup allocation sample decreased from 1,226,616 to 1,065,768 bytes, while sampled JavaScript CPU
decreased from 22.366 to 21.075 ms. This combination bounds the heap increase to module-owned
descriptor and transferred-code retention rather than per-instance descriptor allocation.

Control-normalized 1x readiness regressed 6.6% at p50 and 12.6% at p95; 4x readiness regressed
12.6% at both percentiles. Function inventory and sampled CPU do not identify a new executed helper
hotspot, and the DOM shape, listener count, long-task count, and total heap capacity remained
unchanged. The movement is concentrated in browser task/layout scheduling and is recorded as a
startup target rather than attributed to closure removal. Optimistic-feedback p95 moved from 1.7 to
2.8 ms, but control dispersion was 1.57x, so the comparison correctly rejects attribution. Its 1.6
ms p50 is unchanged.

Node server evidence is stronger. Startup improved 1.7%/2.8% at p50/p95 after normalization.
Saturation throughput improved 13.0% at c16 p50, was within 1.1% at c32, and within 1.0% at c64.
The unsaturated concurrent lane's apparent throughput drop is not attributable because stable
framework ratios dispersed beyond the 1.2x limit. Preloaded render-only p50/p75 improved from
0.1205/0.1279 ms to 0.0681/0.0902 ms. Exact retained the lowest Node post-GC heap and RSS in the
comparison, with a -1,541 byte/request heap slope. The server artifact increased 624 raw, 142 gzip,
and 115 Brotli bytes; this is the focused writer and schema-cache code cost, not request-retained
state.

Bun is retained only as an Exact native-transport diagnostic while React, SvelteKit, and Nuxt use
Bun's Node HTTP compatibility transport. It is therefore excluded from cross-framework ranking
and from conclusions about the Node SSR changes.

### Post-S3 profiling reevaluation

The next-step reevaluation added bundle-level parsed and compiled function counts, precise
coverage/source-map attribution, Rollup rendered-module lengths, post-GC heap dominators, separate
client hydration/DOM phases, and isolated Node render CPU/allocation profiles. Chromium does not
expose source locations for its aggregate parse/compile events, so those totals remain bundle-level;
the report does not manufacture per-module parse or compile counts.

The profiles reject two speculative client changes: shared lifecycle callbacks saved only 1,460
retained bytes while growing code, and range-local adoption arrays caused hydration recovery. The
accepted adoption change removes one redundant ordinary child-slot read. A production-policy audit
then found that the diagnostic phase timers themselves had grown Exact's decoded client by 1,078
bytes and invoked three functions. DOM and hydration phase policies now default to compile-time
false and are replaced only in the explicit comparison profile. The normal bundle is 195,850 raw
bytes, 28 bytes above the S1-S3 checkpoint, while retaining the diagnostic detail in profile builds.

The final 50-sample capture improves control-normalized 4x semantic readiness by 9.8% at p50 and
12.1% at p95, and 4x evaluation by 15.7% and 13.1%. Browser optimistic feedback improves 8.4% at
p50; its p95/p99 controls exceed the 1.2x dispersion limit and remain unattributed. Browser retained
heap increases 0.32%, about 8.3 KB. At 6x, readiness and evaluation tails are mixed. Exact still
executes about 102 KB and invokes 571 functions, so reachable initialization remains the primary
client target rather than function syntax or descriptor micro-optimization.

Node retains the best sequential latency and lowest retained heap, but React remains ahead in raw
sustained throughput. The final run, rebuilt after removing the output-charge batching experiment,
puts Exact's control-normalized saturation throughput 5.7% lower at concurrency 16 and 3.2% lower
at 32, then 1.6% higher at 64. All three stable-framework control dispersions are below the 1.2x
attribution limit. Preloaded render-only p50/p75 is 0.0738/0.1126 ms, confirming that the remaining
lower-concurrency gap is not dominated by component rendering. The output-charge experiment remains
removed because its focused movement was too small and normalized evidence did not support retaining
a micro-optimization. Future SSR work should address the profiled hydration-script, validation,
escaping, prepared-reference, response-size, and transport-envelope costs as coherent mechanisms.

### SSR follow-up steps 1–4

The follow-up first made the remaining Node throughput gap independently attributable. The SSR
harness now balances participant order across recorded measurement rounds, separates an immutable
preloaded renderer lane from an instrumented service fetch/decode lane, and decomposes response
bytes without instrumenting primary requests. Exact and React use the detailed clocks only in that
diagnostic lane. The raw schema advances to version 5 so an older report cannot silently appear to
contain this evidence.

Response decomposition found that Exact and React emit effectively identical semantic markup and
nearly identical application-data payloads. Exact's additional response bytes are primarily native
marker topology, resumption coordinates, and framework identity attributes. A compact dynamic
closing-marker candidate saved 408 response bytes, but the compiled browser acceptance run proved
that it made some recovery templates non-mountable. The candidate and its compatibility machinery
were removed in full; the accepted response retains the identity-bearing marker contract and all
seven Exact browser scenarios pass without root replacement.

Hydration publication retains native `JSON.stringify`. It validates the authored graph once, then
encodes registered reactive arrays as the JSON traversal reaches them instead of constructing a
second encoded graph. The escaped UTF-8 limit is counted without allocating an encoded byte array.
A custom chunk serializer was measured and rejected: the short render profile moved substantial CPU
into string escaping and grew sampled allocations from about 10.2 MB to 13.1 MB.

Prepared server render programs share one immutable empty client-reader table. A candidate that
reused the compiler-created eager-values array as the carrier passed the focused benchmark but failed
three full-suite fragment and intrinsic cases: child normalization correctly interpreted the array as
a child list and flattened it. The candidate was removed instead of special-casing those consumers.
The small nominal wrapper therefore remains necessary to distinguish an invocation from authored
array children. Component props, state, and child values stay request-owned; the implementation does
not hoist or retain them merely to erase an allocation-site label.

### SSR follow-up steps 1–4 final checkpoint

The combined acceptance command was `npm run performance:check`; its existing prerequisite ran the
release profile once before the performance profile. The release profile passed 1,930 package tests
with five skips, all build, TypeScript 7, platform-boundary, reachability, documentation, package,
application, React-compatibility, and browser checks. The performance profile then passed every
reactive, client/server, compiler, theme, DevTools, and React-reference lane. The framework
comparison artifacts were built once, all 28 cross-framework browser scenarios passed, and the same
artifacts were reused for browser, startup CPU, and SSR capture.

The final diagnostic evidence is:

- browser: `.tmp/framework-comparison/raw-1788044661046.json`;
- startup CPU and function inventory:
  `.tmp/framework-comparison/startup-cpu-1788044778779.json`; and
- SSR: `framework-comparison/results/raw/ssr-2026-08-29T23-12-05-529Z.json`.

The working tree is intentionally dirty, so each comparison capture is correctness-gated but marked
non-publishable by the comparison project's review policy. That label does not invalidate the raw
phase evidence or admit it as a release baseline without later specialist review.

Exact's deterministic client artifact is 200,412 raw, 61,066 gzip, and 53,223 Brotli bytes. Startup
coverage reports 195,909 decoded bytes, 102,669 executed bytes, 1,172 profiled functions, and 571
invoked functions. Those values are effectively unchanged from the preceding run, while 1x
before-FCP parsed and compiled functions fell from 379/379 to 351/353 at p50. Browser navigation and
paint nevertheless regressed by roughly 6–9% after stable-control normalization. The movement is in
task and layout scheduling rather than transferred code or function inventory; 1x task p95 regressed
9.6% and layout p95 regressed 7.0% after normalization.

On Node, Exact's sequential total latency is 0.875/1.042/1.462/1.834 ms at
p50/p75/p95/p99, the best of the four participants. Its concurrent throughput is 2,987 requests per
second at p50, behind React's 3,474 but ahead of SvelteKit's 2,247 and Nuxt's 1,383. Stable-control
normalization puts Exact's saturated p50 throughput change at -3.0%, -1.2%, and -2.7% for
concurrency 16, 32, and 64. The equal-8-KiB c32 lane improves 5.1%. An apparent concurrent p95
latency improvement is rejected because controls dispersed 1.276x, beyond the 1.2x limit.

The new attribution lanes locate the remaining Node gap. At c32, preloaded Exact renders 4,347
requests per second versus React's 7,390, with render p50 of 0.126 ms versus 0.051 ms. In the
instrumented service lane, Exact reaches 1,799 requests per second versus React's 2,118. JSON decode
is effectively equal at 0.046 versus 0.048 ms p50; fetch is 9.234 versus 7.499 ms. Render-only
allocation sampling reports 10,145,456 bytes for Exact and 6,937,824 for React over 100 profiled
renders. Exact's leading allocation sites are descriptor validation and attribute emission.

Response size remains 5,749 bytes. Its decomposition is 2,392 semantic-markup bytes, 1,961 marker
comment bytes, 160 identity-attribute bytes, and a 1,022-byte hydration script containing a 958-byte
payload. The payload contains 721 bytes of state and 234 bytes of resumptions. React's 3,384-byte
response contains 2,383 semantic-markup bytes, 56 comment bytes, and a 731-byte comparison-data
script. This evidence rejects deleting application state as supposed duplication and identifies
marker/resumption protocol representation as the coherent future response-size target.

The next client priority is eager runtime initialization and reachable helper work, not lambda or
descriptor micro-optimization. The next server priorities are the measured descriptor/attribute
allocation sites, component-local render execution, and service transport overhead. Bun remains an
Exact native-transport diagnostic only because the other participants still use Bun's Node HTTP
compatibility layer; no cross-framework conclusion in this checkpoint uses Bun results.

### Compact-root and eager-surface follow-up

The compiler-closed SSR path now omits the redundant outer component range, publishes the compact
`m: 1` markerless-root proof, and uses dense paired `x:` ordinals for render-program ranges. The
comparison fixture's marker comments fall from 1,961 to 706 bytes and rendered output from 5,535 to
4,283 bytes while all seven Exact browser scenarios retain the server DOM without root replacement.
The hydration metadata script remains in the DOM but is excluded from the component output range.

On the client, optional authored surface descriptors now install once on the shared compact base.
Concrete component classes no longer register their prototypes eagerly. A full package run proved
that removing the `this.map` descriptor installer would narrow valid reactive list expressions, so
that candidate was restored rather than optimizing code the compiler has not replaced. The retained
shared-base change reduces the production comparison client from 195.40 to 195.16 kB; final function
inventories remain raw and the latency checkpoint uses stable-framework normalization.

### Compact-root and eager-surface measured checkpoint

The combined acceptance command, `npm run performance:check`, passed its correctness prerequisite
and benchmark-only profile. The correctness sequence passed 1,928 package tests with five skips,
all application and documentation checks, the 28-scenario framework-comparison browser gate, Theme
Lab, React compatibility, and the native compiler corpus. Browser, startup CPU, and SSR measurements
then reused one admitted comparison build. The immutable evidence for this follow-up is:

- browser: `.tmp/framework-comparison/raw-compact-root-final.json`;
- startup CPU and function inventory:
  `.tmp/framework-comparison/startup-cpu-compact-root-final.json`; and
- SSR: `.tmp/framework-comparison/ssr-compact-root-final.json`.

The production client artifact is 199,667 raw, 60,776 gzip, and 52,979 Brotli bytes. Startup
coverage reports 195,164 decoded bytes, 101,909 executed bytes, 1,171 profiled functions, and 570
invoked functions. Relative to the preceding accepted follow-up this removes 745 decoded bytes, 760
executed bytes, one profiled function, and one invoked function. The deliberately retained list
surface accounts for valid compiler-produced unstructured and reactive list expressions; removing
it failed the full package contract and was rejected rather than recorded as an optimization.

Exact's Node response is 4,500 bytes, down from 5,749 bytes (21.7%). The compiler-closed root no
longer emits an outer component range, and dense paired render-program markers reduce the fixture's
marker comments from 1,961 to 706 bytes. The small difference from the pre-measurement 4,497-byte
estimate comes from the final rendered fixture being 4,286 rather than 4,283 bytes; the 214-byte
document envelope is unchanged. All seven Exact browser scenarios hydrate without root replacement,
so the reduction preserves identity and behavior rather than deleting resumable state.

Stable-framework normalization against the preceding comparison capture attributes 5.5-5.9%
improvements to p50/p75 warm navigation and load. The 1x p95 task and script durations improve 11.6%
and 7.4%, while FCP moves 10.5% slower; before-FCP parse and compile values move in the opposite
direction and are sensitive to which trace slice crosses the paint boundary. At 4x and 6x, most
material movements favor Exact, including p75 FCP at 4x, p75 readiness at 6x, and parse, compile,
script, task, and blocking-time rows. No deterministic code or function counter is normalized.

On Node, sequential total latency is 0.985/1.169/1.645/1.755 ms at p50/p75/p95/p99 and remains
competitive with the best participant. Concurrent p50 throughput is 2,412 requests/second, behind
React's 3,098 but ahead of SvelteKit's 2,077 and Nuxt's 1,403. Against the preceding run, normalized
concurrent p50 throughput falls 14.3% and total latency rises 58.0% at low confidence; the stable
controls disperse by 1.138x and adjacent saturation lanes do not reproduce that magnitude. At
saturation 16 throughput improves 5.8-6.1% at high confidence, while saturation 32 is stable and
saturation 64 CPU worsens 9.6% despite stable throughput. These contrary lanes are retained as
environment-sensitive scheduling movement, not attributed to the deterministic marker encoding.

The equal-8-KiB Node diagnostics leave Exact 7-13% behind React in throughput, and render-only p50
is 0.054 ms versus React's 0.020 ms. Response transport therefore explains part, but not all, of the
concurrency gap; component-local render execution remains the highest-value server follow-up. Exact
has the lowest post-GC heap-used point of the four participants. Retention slopes are negative for
all participants in the bounded window and do not establish accumulating retained allocations. Bun
remains a separate diagnostic only: Exact uses `bun-fetch`, while the other participants use Bun's
Node HTTP compatibility path, so this checkpoint draws no cross-framework conclusion from Bun.

### Post-acceptance defined-function-task reuse checkpoint

The first post-acceptance task specialization removes a duplicated setup task record when an
already-defined function task is invoked during setup. The compiler now emits one durable task
definition and invokes its compiled ABI normally. It does not retain the former cloned task body as
an alternate execution path. This checkpoint is deliberately separate from indexed value operands,
synchronous relationship lowering, and hydration work.

The combined acceptance command, `npm run performance:check`, ran its release prerequisite once and
then completed the performance profile. The release sequence passed 1,934 package tests with five
skips, every application and browser matrix, the 30-test composition corpus, Theme Lab, React
compatibility, and the 335-file native compiler corpus. Browser, startup CPU, and SSR measurements
reused one admitted framework-comparison build. The immutable evidence is:

- browser: `.tmp/task-invocation-reuse/browser-accepted.json`;
- startup CPU and function inventory: `.tmp/task-invocation-reuse/startup-accepted.json`;
- SSR: `framework-comparison/results/raw/ssr-2026-08-30T18-30-37-329Z.json`; and
- the complete current and control-normalized report:
  `.tmp/task-invocation-reuse/complete-framework-report.md`.

The focused compiler comparison removes 1,853 generated bytes and four syntactic functions from
`IncidentApp`; its task inventory falls from seven definitions and six activations to six and five.
`IncidentQueue` and `IncidentDetail` are unchanged. In the admitted production build, Exact is
198,531 raw, 60,443 gzip, and 52,794 Brotli bytes. Startup coverage reports 194,028 decoded bytes,
101,867 executed bytes, 1,165 profiled functions, and 570 invoked functions. Against the accepted
compact-root checkpoint, those deterministic changes are -1,136 decoded bytes, -42 executed bytes,
and -6 profiled functions, with no invoked-function reduction. A tighter task-only ten-sample A/B
also measured 19,652 fewer sampled startup-allocation bytes (-1.6%) and essentially unchanged
retained heap. The expected broad heap and invoked-function reductions therefore did not
materialize in this slice.

Stable-control normalization leaves 1x evaluation nearly flat at p50 and p75 (-0.3% and -0.6%) but
8.6% slower at p95 and p99 with low confidence. Readiness is 2.1% and 4.5% slower at p50 and p75,
then 3.3% faster at p95 and p99. Browser navigation moves -1.2%, +1.6%, -3.3%, and -3.3% across
p50/p75/p95/p99. Optimistic feedback is 9.6% and 22.4% slower at p50 and p75; its tail controls exceed
the 1.2x dispersion limit and remain raw. The setup-only lowering has no direct interaction path,
and the focused A/B did not reproduce an interaction regression, so this checkpoint records the
movement without attributing it to the candidate. Throttled startup lanes are similarly mixed and
remain counter-metrics rather than evidence derived from artifact size.

The first eight-wave SSR capture reported ordinary concurrent Exact throughput of
1,972/2,285/2,471/2,471 requests per second at p50/p75/p95/p99, including an apparent 18.3% raw p50
regression. That population is rejected for acceptance rather than excused by ineligible controls.
The identical server artifact hash subsequently produced p50 values of 2,229, 2,849, and 2,856 in
rotated runs, while an earlier same-artifact capture produced 2,915. The accepted remeasurement uses
50 waves and reports 2,856/3,131/3,332/3,366 requests per second. Against the compact-root capture,
that is +18.4%, +27.7%, +21.6%, and +22.8% raw. Indicative normalization gives +4.1%, +12.7%, +8.7%,
and +8.3%. The checkpoint accepts the reproducible raw throughput improvement. Control dispersion of
1.22-1.28x means only that the evidence cannot assign the exact size of that improvement to this
client compiler change. Across all five same-artifact captures, 82 retained windows report
2,709/3,034/3,300/3,366 requests per second, which remains above the compact-root p50.

The measurement contract now defaults the ordinary concurrent lane to 50 waves and reports raw
movement beside normalized movement. An adverse raw primary-metric movement of at least 10% blocks
acceptance until repeated same-artifact evidence either reproduces it or establishes an unstable
initial population. Normalization remains an attribution tool: it cannot waive that review, and it
does not discard a reproducible measured improvement when controls cannot quantify attribution.

The Exact Node response remains 4,500 bytes. At saturation c32, normalized throughput changes by
+0.9%, +0.2%, -0.2%, and -0.2% across p50/p75/p95/p99. Equal-8-KiB c32 throughput moves +3.1%,
+3.2%, +3.2%, and +3.2%. Render-only p50 is 0.0536 ms versus 0.0189 ms for React, while Exact's raw
prior p50 was 0.0544 ms. Only React exposes the corresponding render-only and preloaded renderer
lane, so those cross-run Exact values are not normalized and no improvement is attributed. The
remaining CPU and allocation sites continue to support the separate direct-server-executor
hypothesis; this client checkpoint neither implements nor claims that server work.

The server artifact is 1,277 raw bytes larger than the compact-root checkpoint. That deterministic
counter-metric includes the intervening admission and framework fixes and is not treated as a hard
limit or as a performance conclusion. Bun remains a separately reported transport diagnostic. All
other timing, throughput, CPU, and memory comparisons use eligible stable-control normalization;
bytes and function inventories remain raw.

### Post-acceptance indexed text operand checkpoint

The first component-local operand slice replaces only compiler-proven whole-slot state and prop
text readers. The existing immutable render-program `wire` carries `[source, slot]`, where state is
source `0` and props is source `1`; the focused text operation reads the durable component owner's
indexed facade. Derived, nested, structural, component, and arbitrary authored expressions retain
executable readers and their existing computation ownership. No per-instance operand plan, bound
function, general interpreter, or alternate render path was introduced.

The combined acceptance command, `npm run performance:check`, ran its release prerequisite once and
passed. The release sequence passed 1,934 package tests with five skips, all applications and
browser matrices, the 31-test composition corpus covering 34 compiler paths, Theme Lab, React
compatibility, and the 335-file native compiler corpus. The immutable focused evidence is:

- browser, 50 samples per framework: `.tmp/component-operands/browser-restored-50.json`;
- startup CPU and function inventory, 50 samples per framework at 1x, 4x, and 6x:
  `.tmp/component-operands/startup-restored-complete-50.json`;
- unchanged-server SSR evidence, 50 ordinary concurrent waves:
  `framework-comparison/results/raw/ssr-2026-08-30T18-30-37-329Z.json`; and
- the complete current, historical, and control-normalized report:
  `.tmp/component-operands/complete-framework-report.md`.

The admitted Exact client is 198,640 raw, 60,545 gzip, and 52,855 Brotli bytes. Relative to the
immediately preceding task-reuse checkpoint, decoded code grows from 194,028 to 194,137 bytes and
executed code from 101,867 to 102,008 bytes. Those small deterministic counter-movements are not a
performance proxy or an acceptance ceiling. Profiled functions fall from 1,165 to 1,161, compiled
functions from 789 to 788, and invoked functions from 570 to 569; parsed functions remain 773.
This is the narrower current-fixture effect of removing exact text readers, not the larger function
reduction estimated from the older pre-corpus generated shape.

The 50-sample population does not reproduce the earlier ten-sample evaluation improvement.
Control-normalized 1x evaluation changes by +0.5%, +2.7%, -1.5%, and -4.1% at
p50/p75/p95/p99; control dispersion is 1.03-1.07x. Startup heap changes by 760 bytes (+0.03%) and
browser retained heap by the same 760 bytes, with stable controls, so no heap benefit is claimed.
Browser navigation improves 2.6%, 2.2%, and 1.2% raw through p95, but normalization attributes the
p50 and p75 movement to controls and leaves -2.1% at p95. Optimistic feedback is unchanged at p50
and p75. Its isolated p95 and p99 values are slower, while controls disperse 1.406x and 1.313x;
those tails remain raw noise rather than either a claimed regression or an excused result.

The checkpoint is accepted as a narrow architectural specialization with a confirmed function-
topology reduction and neutral measured timing/retention, not as the previously hypothesized
1-3 ms evaluation win. The Node and Bun server artifact hashes exactly match the accepted task
checkpoint (`4b30ca263b5d5d568c1aecdb03a2b832d7a6f977baa003a5e0e771568247ecee` and
`cd1bce7ad4f6b058aab3e02f4bcea9a1dffd8529c180e375c6557967bf3c71ab`), so the complete server
tables reuse the same admitted raw evidence without attributing server movement to this client-only
change. The next compiler slice is defined-function task relationship specialization; hydration
adoption and server executor work remain separate checkpoints.

### Post-acceptance indexed synchronous input-update checkpoint

The first relationship specialization moves one compiler-proven whole top-level prop read and
direct indexed state write out of client computation activation. The compiler emits one immutable
module-level input plan, leaves its initial application at the authored setup position, and routes
later finalized prop batches through the receiving component's indexed dirty mask. Nested reads,
authored calls, asynchronous work, and arbitrary expressions retain their computation or task
owners. The comparison fixture therefore removes only `loading = !props.initialData`; its three
nested `initialData` projections and authored path calculation remain reactive computations.

The accepted validation ran `npm run performance:check` after the focused compiler, core, type,
source-architecture, and 34-test composition-corpus checks passed. The release prerequisite passed
1,935 package tests with five skips, all application and browser matrices, Theme Lab, React
compatibility, and the 335-file native compiler corpus. The immutable evidence is:

- browser, 50 samples per framework: `.tmp/sync-relationships/browser-50.json`;
- startup CPU and function inventory, 50 samples per framework at 1x, 4x, and 6x:
  `.tmp/sync-relationships/startup-complete-50.json`;
- an independent 50-sample 4x/6x reproduction population:
  `.tmp/sync-relationships/startup-throttled-confirm-50.json`;
- unchanged-server SSR evidence, including 50 ordinary concurrent waves:
  `.tmp/task-invocation-reuse/ssr-recheck-50waves-round3.json`; and
- the complete current, historical, and control-normalized report:
  `.tmp/sync-relationships/complete-framework-report.md`.

Against the immediately preceding indexed-text checkpoint, the production client changes from
198,640 to 199,054 raw bytes, 60,545 to 60,707 gzip bytes, and 52,855 to 52,967 Brotli bytes.
Decoded code increases by 414 bytes and executed code by 107 bytes. These are explicit
counter-metrics, not an acceptance ceiling or a proxy for runtime performance. Parsed and compiled
functions each fall by one, invoked functions fall from 569 to 568, and profiled functions remain
1,161. Startup heap falls from 2,464,780 to 2,461,668 bytes. The focused generated `IncidentApp`
loses one syntactic function and one computation activation; `IncidentQueue` and `IncidentDetail`
remain unchanged.

At 1x, stable-control normalization puts evaluation at -2.1%, -0.2%, +3.9%, and +11.0% across
p50/p75/p95/p99; confidence falls from medium/high at the center to low in the tail. Optimistic
feedback improves 1.0%, 3.8%, and 6.0% through p95; the raw p99 improves from 4.0 to 2.1 ms but its
controls exceed the 1.2x dispersion limit. Browser navigation is -0.2%, +2.2%, -2.6%, and -5.9%.
The sampled startup-allocation total rises 4.1% raw, while the three controls rise 6.9%, 13.7%, and
3.0%; that single untimed diagnostic is consistent with, but does not independently establish, a
small allocation improvement after environmental adjustment.

The first throttled population reported large 4x/6x upper-tail regressions despite nearly neutral
medians. They were not accepted at face value or discarded. In the independent 50-sample repeat,
the 4x evaluation changes are +0.5%, +6.3%, +1.3%, and +15.4%; the 6x changes are +3.7%, +0.8%,
-1.0%, and +1.1%. The original 11-47% p95/p99 evaluation movements therefore do not reproduce as a
stable curve. The remaining isolated p75/p99 and paint tails are retained as counter-metrics; this
checkpoint claims no evaluation win.

The checkpoint is accepted for the compiler-proven topology reduction, lower function inventory,
lower retained startup heap, and improved optimistic-feedback population. The code-size increase
and unstable throttled tails remain visible rather than being converted into hard rejection rules.
The Exact Node and Bun server artifact hashes remain exactly
`4b30ca263b5d5d568c1aecdb03a2b832d7a6f977baa003a5e0e771568247ecee` and
`cd1bce7ad4f6b058aab3e02f4bcea9a1dffd8529c180e375c6557967bf3c71ab`; the full server tables,
including ordinary concurrent requests per second, therefore reuse the accepted same-artifact
50-wave evidence without attributing server movement to this client-only change.

### Post-acceptance direct synchronous server executor checkpoint

Compiler-proven synchronous JSX roots now return their prepared component-local server program
directly. Their artifacts mark that closed execution form, and the request executor owns setup,
sink commitment, hook execution, checkpoints, rollback, and disposal without allocating the former
returned render closure, synchronous issued result, completed result projection, or frame/owner
pair. Forwarded and arbitrary output retains its callable component-local contract, while scheduled
work retains the issued protocol; the change does not install a second fast path.

The accepted validation ran `npm run performance:check` after focused compiler, core, SSR,
formatting, JSDoc, source-architecture, and composition-corpus checks passed. Its release
prerequisite passed 1,937 package tests with five skips, all maintained application and browser
matrices, Theme Lab, React compatibility, and the 335-file native compiler corpus. The composition
corpus now has 36 compiler paths and 35 normative tests. The immutable evidence is:

- unchanged client browser population, 50 samples per framework:
  `.tmp/sync-relationships/browser-50.json`;
- unchanged startup CPU/function population, 50 samples per framework at 1x, 4x, and 6x:
  `.tmp/sync-relationships/startup-complete-50.json`;
- final SSR population, 50 sequential samples and 50 ordinary concurrent waves:
  `framework-comparison/results/raw/ssr-2026-08-30T23-46-11-315Z.json`; and
- the complete current and immediate-prior control-normalized report:
  `.tmp/direct-server-executor/complete-framework-report.md`.

All four rebuilt client artifact hashes exactly match the preceding accepted checkpoint, so its
complete client populations remain current evidence. Exact therefore remains 199,054 raw, 60,707
gzip, and 52,967 Brotli client bytes, with 194,551 decoded bytes, 102,115 executed bytes, 772 parsed
functions, 787 compiled functions, 568 invoked functions, and 2,461,668 startup-heap bytes. This
server-only checkpoint attributes no client movement.

The Exact Node server artifact changes from 223,098 to 207,374 raw bytes (-7.0%), 48,718 to 44,874
gzip bytes (-7.9%), and 40,260 to 37,317 Brotli bytes (-7.3%). Its three-file count and 4,500-byte
response are unchanged. These deterministic size movements are counter-metrics and are not used as
a proxy for runtime performance.

Render-only p50 improves from 0.0536 to 0.0520 ms (-3.0% raw). Only Exact and React expose this
renderer-owned lane, so it cannot satisfy the two-control normalization rule and no normalized
magnitude is claimed. Sampled render-only allocation falls from 9,386,832 to 8,805,544 bytes
(-581,288 bytes, -6.2%). The removed closure/result/projection structure therefore produces a
measured CPU and allocation improvement, although the CPU gain is smaller than the original
15-30% hypothesis.

Ordinary concurrent Exact throughput is 2,865/3,158/3,301/3,436 requests per second at
p50/p75/p95/p99, versus 2,856/3,131/3,332/3,366 raw before. The corresponding movements are +0.3%,
+0.9%, -0.9%, and +2.1%. P50 control dispersion is 1.273x, so its magnitude remains raw; eligible
p75-p99 comparisons are reported independently. At p50, eligible normalization puts worker
participant work at 2.8342 ms before and 2.7462 ms current (-3.1%). The measurement is accepted as
the observed result rather than rejected because the controls cannot attribute all end-to-end
movement.

At equal-8-KiB c32, eligible normalized p50 throughput moves from 1,805.4 to 1,820.9 requests per
second (+0.9%) and participant work improves 0.7%. At ordinary saturation c32, eligible normalized
p50 throughput moves from 2,109.5 to 2,046.5 requests per second (-3.0%) even though participant
work improves 0.75%. Normalized client total time rises 1.5%, GC count rises 7.9%, and GC duration
rises 9.6% in that lane. The contradictory throughput and renderer-work movements therefore point
to saturation scheduling and garbage collection outside the removed synchronous execution layers;
the regression is retained as a counter-metric rather than attributed to the executor or hidden.

The checkpoint is accepted for coherent deletion of the synchronous wrapper stack, compiler-backed
closure folding, lower render-only time and allocation, lower artifact reachability, unchanged
response identity, and improved participant work. It does not claim the original projected
15-30% render-only or 10-25% preloaded-throughput gains. Bun remains a separate diagnostic because
Exact uses `bun-fetch` while the other participants use Bun's Node HTTP compatibility path. The
next server slice is provenance-aware byte accounting in the request-owned sink; indexed resumption
capture remains separate until that accounting checkpoint is measured.

### Post-acceptance provenance-aware output-byte checkpoint

Compiler-closed synchronous render programs now carry immutable UTF-8 byte facts for their static
spans. The focused server operations charge those facts, markers, escaped dynamic text, attributes,
and committed child output directly into the request-owned bounded sink. The sink owns its byte
ledger, surrogate-boundary state, and allocation-free component-attempt checkpoints alongside the
ordered output. Rollback restores both output and accounting state. Compatibility, extension,
unsafe, enhancement, and otherwise foreign output invalidates partial provenance and receives one
exact scan when the root is committed. Older imported artifacts without the byte fact retain the
per-static-write exact scanner. This is an extension of the accepted component-local server
program, not a general output tape or a second execution path.

Before implementation, the accepted direct-executor artifact still performed a final root scan.
Its render-only profile attributed 7.584 ms and 291,208 sampled bytes to
`SsrOutputBuffer.charge`. The expected gate called for a 4-10% render-only p50 improvement, 3-8%
preloaded participant-work and c32-throughput improvements, and 0.2-0.5 MB lower sampled
allocation, while retaining the 4,500-byte response and exact rollback and Unicode accounting.

The accepted validation ran `npm run performance:check` once after focused compiler, core, SSR,
formatting, JSDoc, source-architecture, and composition-corpus checks passed. Its release
prerequisite passed 1,937 package tests with five skips, all maintained application and browser
matrices, Theme Lab, React compatibility, and the 335-file native compiler corpus. The composition
corpus now has 37 compiler paths and 36 normative tests. The immutable evidence is:

- current browser population, 50 samples per framework:
  `.tmp/output-byte-accounting/accepted/browser-50.json`;
- current startup CPU/function population, 50 samples per framework at 1x, 4x, and 6x:
  `.tmp/output-byte-accounting/accepted/startup-50.json`;
- current SSR population, 50 sequential samples and 50 ordinary concurrent waves:
  `framework-comparison/results/raw/ssr-2026-08-31T01-23-33-332Z.json`;
- 25 clean alternating fresh-process focused profile pairs, whose candidate evidence is under
  `.tmp/output-byte-accounting` and whose accepted-checkout counterparts are preserved under
  `.tmp/output-byte-accounting/accepted/focused-baseline`; and
- the complete current and immediate-prior control-normalized report:
  `.tmp/output-byte-accounting/complete-framework-report.md`.

All four client artifacts remain deterministic. Exact remains 199,054 raw, 60,707 gzip, and
52,967 Brotli client bytes, with 194,551 decoded bytes, 102,115 executed bytes, 772 parsed
functions, 787 compiled functions, 568 invoked functions, and 2,605,840 browser heap bytes. This
server-only checkpoint attributes no client movement.

The Exact Node server artifact changes from 207,374 to 212,606 raw bytes (+2.5%), 44,874 to
46,067 gzip bytes (+2.7%), and 37,317 to 38,192 Brotli bytes (+2.3%). Its three-file count and
4,500-byte response are unchanged. The size increase is the deterministic cost of static byte
operands and the request-owned ledger; it remains a counter-metric rather than a runtime proxy or
an acceptance limit.

Render-only time changes from 0.052/0.056/0.081/0.109 ms to
0.049/0.053/0.073/0.112 ms at p50/p75/p95/p99: -5.2%, -5.7%, -10.9%, and +2.8% raw. This lane
has only one unchanged control and therefore cannot be normalized under the two-control rule. The
25-pair focused profile independently records median p50 and p75 improvements of 3.6% and 2.9%,
with p50 wins in 23 pairs and p75 wins in 19. Its median accounting CPU falls from 8.096 to
1.993 ms (-75.4%). In the complete profile, `charge` falls from 7.584 to 1.536 ms and the new
`accountKnown` operation accounts for 3.587 ms, a combined 32.4% reduction in the accounting
sites.

The broad render-only allocation sampler moves from 8,805,544 to 9,242,280 bytes (+5.0%), contrary
to the expected reduction. No byte-ledger operation appears among its sampled allocation sites,
and the 25-pair focused population moves median allocation from 9,602,160 to 9,410,360 bytes
(-2.0%), with 19 of 25 pairs improving. The checkpoint therefore does not claim a broad sampled-
allocation win; it records the reproducible focused reduction and retains the broader sampler as a
counter-metric. Post-GC retained heap is effectively stable at p50 (+0.06%) and rises 1.1% at the
p95/p99 tails after eligible normalization.

Ordinary concurrent Exact throughput is 3,116/3,290/3,396/3,513 requests per second at
p50/p75/p95/p99. Its comparison population is 2,865/3,129/3,179/3,330, producing +8.8%, +5.1%,
+6.8%, and +5.5%. P50 remains raw because control dispersion exceeds 1.2x; p75-p99 use eligible
control normalization with dispersion of 1.138x, 1.122x, and 1.109x. Participant work improves
5.9-10.9% across that population, although its p95/p99 control populations are ineligible.

At preloaded c32, raw throughput rises from 4,495 to 4,703 requests per second (+4.6%), participant
work falls from 0.186 to 0.182 ms (-2.2%), and render time falls from 0.120 to 0.118 ms (-1.7%).
Only React participates as a control in that diagnostic, so these changes remain raw rather than
being mislabeled as normalized. At equal-8-KiB c32, eligible normalized p50 throughput rises from
1,776 to 1,831 requests per second (+3.1%); p75-p99 are effectively unchanged. Ordinary saturation
c32 improves 7.3%, 5.1%, 4.8%, and 4.8% at p50/p75/p95/p99 after eligible normalization. The
4,500-byte response, response decomposition, markers, hydration payload, and request retention
contract remain unchanged.

The checkpoint is accepted for removing the redundant full-output byte scan from the normal
compiler-closed root, exact request-owned accounting and rollback, lower render-only p50-p95,
reproducibly lower focused accounting CPU and allocation, and improved ordinary, preloaded, equal-
payload, and saturation throughput. The p99 render tail, broader allocation sample, retained-heap
tails, and server artifact growth remain explicit counter-metrics. Bun remains a separate
diagnostic because Exact uses `bun-fetch` while the other participants use Bun's Node HTTP
compatibility path. The next server slice is direct compact indexed resumption capture in the same
request-owned sink; hydration publication remains a separate later checkpoint.

### Post-acceptance direct indexed resumption-capture checkpoint

Synchronous compiler-closed components now reserve a numeric request-local capture token and
publish state directly as stable indexed entries in the final compact resumption tuple. The
request-owned capture owns ordering, checkpoints, rollback, and publication. Scheduled components
reserve their token on their existing issued frame so stabilization order remains unchanged;
generic components retain their instance-token association. Compiler schemas cache only immutable
field paths, indexes, and continuation facts. Public render results and output extensions still
observe the named activation contract through a lazy request-owned projection. No props, state,
captures, or serialized request values are retained by module-level artifacts.

Before implementation, the accepted output-accounting profile still attributed 234,608 sampled
bytes to named state capture, 225,320 bytes to `compactResumption`, and 165,752 bytes to
`compactEntries`. The expected gate called for removing those copy and compaction sites, reducing
sampled render allocation by 0.5-0.9 MB, improving render/publication time by 4-9%, and retaining
the response, ordering, rollback, extension, and public-result contracts. Those ranges remained
hypotheses rather than acceptance limits.

The accepted validation ran `npm run performance:check` once after the focused SSR build and
176-test package suite, formatting, explicit-any, JSDoc, source-architecture, and 36-test
composition-corpus checks passed. Its release prerequisite passed 1,937 package tests with five
skips, all maintained application and browser matrices, Theme Lab, React compatibility, and the
335-file native compiler corpus. The composition inventory remains 37 compiler paths and 36
normative tests because this checkpoint changes the server runtime representation rather than
compiler acceptance. The immutable evidence is:

- browser, 50 samples per framework:
  `.tmp/indexed-resumption-capture/accepted/browser-50.json`;
- startup CPU and function inventory, 50 samples per framework at 1x, 4x, and 6x:
  `.tmp/indexed-resumption-capture/accepted/startup-50.json`;
- SSR, 50 sequential samples and 50 ordinary concurrent waves:
  `framework-comparison/results/raw/ssr-2026-08-31T02-30-18-618Z.json`;
- the pre-implementation gate: `.tmp/indexed-resumption-capture/expected-metrics.md`; and
- the complete current and immediate-prior control-normalized report:
  `.tmp/indexed-resumption-capture/complete-framework-report.md`.

All four client artifact hashes and deterministic client counters remain unchanged. Exact remains
199,054 raw, 60,707 gzip, and 52,967 Brotli client bytes, with 194,551 decoded bytes, 102,115
executed bytes, 772 parsed functions, 787 compiled functions, 568 invoked functions, and 2,461,668
startup-heap bytes. The separately sampled browser-startup allocation rises from 1,208,888 to
1,270,604 bytes, while React falls 4.4%, SvelteKit falls 5.1%, and Nuxt rises 6.7%; because the
client artifact is identical and the controls disagree, this server-only checkpoint attributes no
client allocation or timing movement to the change.

The Exact Node server artifact changes from 212,606 to 214,520 raw bytes (+0.9%), 46,067 to
46,620 gzip bytes (+1.2%), and 38,192 to 38,649 Brotli bytes (+1.2%). Its three-file count,
4,500-byte response, 964-byte hydration payload, and 234-byte resumption field are unchanged. The
artifact increase is the deterministic cost of token publication and lazy named projection; it is
recorded as a counter-metric rather than treated as a runtime proxy or hard size limit.

Render-only allocation falls from 9,242,280 to 8,810,456 sampled bytes (-431,824 bytes, -4.7%),
and sample count falls from 2,119 to 2,025. A separate five-run focused population records a median
fall from 9,410,360 to 8,946,760 bytes (-463,600 bytes, -4.9%). `compactResumption`,
`compactEntries`, and the former named `captureStateValues` site are absent from the current top
sites; direct `captureStateEntries` accounts for 334,200 sampled bytes. The measured reduction is
slightly below the estimated 0.5 MB lower bound but confirms that the obsolete intermediate
records and copies were removed rather than moved.

Render-only time changes from 0.049/0.053/0.073/0.112 ms to
0.048/0.058/0.084/0.113 ms at p50/p75/p95/p99: -2.4%, +10.2%, +15.7%, and +0.6% raw. The focused
five-run population improves median p50 from 0.0730 to 0.0705 ms (-3.4%). Only Exact and React
expose render-only data, so the lane cannot satisfy the two-control rule. The checkpoint therefore
claims the repeatable center improvement and allocation reduction, not the projected 4-9% broad
timing win; the p75-p99 full-profile movements remain explicit counter-metrics.

Ordinary concurrent Exact throughput is 2,971/3,092/3,341/3,410 requests per second at
p50/p75/p95/p99, versus 3,116/3,290/3,372/3,513 before: -4.7%, -6.0%, -0.9%, and -2.9%. React
and Nuxt also fall while SvelteKit rises, leaving p50, p75, and p99 control dispersion above 1.2x;
only p95 is eligible, at 1.177x dispersion. These raw end-to-end movements are reported as a
regression and are not attributed solely to the indexed capture. At ordinary saturation c32,
eligible normalized throughput changes by -2.8%, -2.3%, -3.4%, and -3.4%. At equal-8-KiB c32,
eligible normalized throughput changes by -0.9%, -1.5%, -1.5%, and -1.5%. Both counter-movements
are retained.

At preloaded c32, raw throughput changes from 4,703/4,763/4,763/4,763 to
4,583/4,623/4,623/4,623 requests per second (-2.6% to -2.9%). Participant work changes from
0.182/0.191/0.217/0.254 to 0.185/0.194/0.225/0.304 ms, while render time is effectively stable at
the center, 0.118/0.124 ms versus 0.118/0.122 ms. Only React participates as a control in this
diagnostic, so these values remain raw. The higher GC duration and upper-tail participant work are
consistent with the concurrent counter-metrics and are not hidden by the focused allocation win.

The checkpoint is accepted for coherently deleting named intermediate resumption records and
post-render compaction, preserving request isolation and all publication contracts, and producing
a repeatable 4.7-4.9% sampled-allocation reduction with a smaller center render-time improvement.
It does not claim an end-to-end throughput win: the ordinary, saturation, equal-payload, and
preloaded regressions remain part of the accepted record and are inputs to the next profile gate.
Bun remains a separate diagnostic because Exact uses `bun-fetch` while the other participants use
Bun's Node HTTP compatibility path. The next server slice rebuilds hydration publication around
the already-final compact capture representation while retaining descriptor-safe validation and
native `JSON.stringify`.

### Post-acceptance compact hydration-publication checkpoint

The normal direct-capture path now constructs the final compact hydration envelope once from the
already-indexed resumption tuples. Framework-created envelope arrays and tuples are recorded in a
request-local structural-known set, so validation does not repeat prototype and property-descriptor
inspection for those containers. Validation still recursively visits every value, and authored
objects retain the descriptor-safe accessor, cycle, depth, entry, and byte limits. The explicit
output-extension path keeps the generic named-resumption and compaction behavior. Publication
continues to use native `JSON.stringify`; no custom serializer or second wire representation was
introduced.

Before implementation, the accepted indexed-capture profile still attributed 7.462 ms to
`serializeJson`, 7.010 ms to `validateContainer`, 2.488 ms to `validateValue`, and 1,166,288 sampled
bytes to property-descriptor inspection. The expected gate called for a 4-10% render-only center
improvement and 0.3-0.8 MB lower sampled allocation while preserving the 4,500-byte response,
descriptor-safe authored-value validation, graph limits, extensions, and request isolation. These
ranges were hypotheses rather than acceptance limits.

The accepted validation ran `npm run performance:check` exactly once after the focused SSR build,
178-test SSR suite, formatting, explicit-any, JSDoc, source-architecture, and 36-test composition
corpus passed. Its release prerequisite passed 1,937 package tests with five skips, all maintained
application and browser matrices, Theme Lab, React compatibility, and the 335-file native compiler
corpus. The composition inventory remains 37 compiler paths and 36 normative tests because this
checkpoint changes server publication rather than compiler acceptance. The immutable evidence is:

- the unchanged accepted client browser population, 50 samples per framework:
  `.tmp/indexed-resumption-capture/accepted/browser-50.json`;
- the unchanged accepted startup CPU and function population, 50 samples per framework at 1x, 4x,
  and 6x: `.tmp/indexed-resumption-capture/accepted/startup-50.json`;
- current SSR, 50 sequential samples and 50 ordinary concurrent waves:
  `framework-comparison/results/raw/ssr-2026-08-31T03-28-05-551Z.json`;
- five current and five immediate-prior focused render profiles under
  `.tmp/output-byte-accounting/focused-render-profile-hydration-publication-*.json` and
  `.tmp/output-byte-accounting/focused-render-profile-indexed-resumption-nosnapshot-*.json`;
- the pre-implementation gate: `.tmp/hydration-publication/expected-metrics.md`; and
- the complete current and immediate-prior control-normalized report:
  `.tmp/hydration-publication/complete-framework-report.md`.

The Exact client artifact is byte-identical to the preceding accepted checkpoint, so its existing
50-sample browser and startup population remains the relevant evidence. Exact remains 199,054 raw,
60,707 gzip, and 52,967 Brotli client bytes, with 194,551 decoded bytes, 102,115 executed bytes, 772
parsed functions, 787 compiled functions, 568 invoked functions, and 2,461,668 startup-heap bytes.
This server-only checkpoint attributes no client movement.

The Exact Node server artifact changes from 214,520 to 217,155 raw bytes (+1.23%), 46,620 to 47,134
gzip bytes (+1.10%), and 38,649 to 39,068 Brotli bytes (+1.08%). Its three-file count, 4,500-byte
response, 964-byte hydration payload, and 234-byte resumption field are unchanged. The increase is
the deterministic cost of separating direct and extensible metadata ownership and carrying the
request-local structural-known set. It is recorded as a counter-metric, not a hard size limit or a
proxy for execution performance.

Render-only time changes from 0.048/0.058/0.084/0.113 ms to
0.045/0.051/0.068/0.098 ms at p50/p75/p95/p99: -5.8%, -12.5%, -18.5%, and -12.9% raw. Only Exact
and React expose this renderer-owned lane, so no two-control-normalized magnitude is claimed. The
independent five-run focused population improves median p50/p75/p95/p99 by 5.5%, 6.1%, 5.0%, and
6.0%. Broad sampled render allocation falls from 8,810,456 to 8,076,656 bytes (-733,800 bytes,
-8.3%); the five-run median falls from 8,946,760 to 8,383,544 bytes (-563,216 bytes, -6.3%).
Property-descriptor allocation falls from 1,166,288 to 618,200 sampled bytes, directly confirming
that final framework containers are no longer rediscovered as authored structures. In the single
broad CPU sample, `serializeJson`, `validateContainer`, and `validateValue` do not individually
fall, while `renderHydrationScript` allocation rises from 152,272 to 184,632 bytes; those stochastic
site movements remain counter-metrics rather than being hidden by the consistent total-time and
allocation improvements.

Ordinary concurrent Exact throughput is 3,089/3,182/3,323/3,362 requests per second at
p50/p75/p95/p99, versus 2,971/3,092/3,341/3,410 raw before. P50 improves 4.0% raw but is ineligible
for normalization. Eligible p75-p99 control-normalized comparisons move -1.5%, -3.6%, and -3.7%.
Exact participant work improves 2.0-12.5% raw, while GC duration rises from 11.59 to 20.58 ms in the
ordinary population. The center throughput gain, normalized tail regression, and garbage-collection
movement are all retained; none is inferred solely from the last run.

At ordinary saturation c32, eligible normalized throughput improves 0.9%, 1.5%, 2.0%, and 2.0% at
p50/p75/p95/p99, with participant work improving 0.8-1.7%. Saturation c64 improves 1.4%, 2.9%,
2.6%, and 2.6%. At equal-8-KiB c32, eligible normalized throughput changes -3.6%, +0.1%, +0.1%, and
+0.1%; participant work is 0.6-8.6% slower. The equal-payload p50 and work regressions therefore
remain explicit counter-metrics.

Preloaded c32 raw throughput rises from 4,583/4,623/4,623/4,623 to
4,675/4,689/4,689/4,689 requests per second. Participant work improves at p50-p95 and render time
improves across the population; c8 and c64 show the same broad direction. This diagnostic has only
React as a control, so it remains raw. Post-GC retained heap is nearly unchanged raw at the center
and rises 0.36% at p95/p99, while eligible control normalization reports +5.6% to +8.8% because the
controls moved. The retained slope remains negative at -1,597 bytes per request, so the checkpoint
records both views and does not infer a leak or dismiss the normalized counter-metric.

The checkpoint is accepted for deleting redundant hydration-envelope compaction and structural
descriptor inspection from the direct path, preserving authored-value validation and extensions,
and producing consistent 5-6% focused render-time and 6-8% allocation reductions. Its artifact
growth, ordinary normalized tail throughput, equal-payload p50 and work, GC duration, and normalized
retained-heap movements remain part of the accepted record. Bun remains a separate diagnostic
because Exact uses `bun-fetch` while the other participants use Bun's Node HTTP compatibility path.
The next client slice profiles and specializes hydration range adoption without changing the native
component ABI or weakening transactional mismatch recovery.

### Post-acceptance compiler-selected SSR attribute checkpoint

The hydration range-adoption hypothesis was profiled first and rejected without changing the
accepted architecture; its recoverable work remains in `stash@{0}`. The next current server profile
confirmed that compiler-known native attributes still rediscovered property behavior at runtime.
The accepted implementation extends the component-local render program with immutable root
attribute plans and focused direct-attribute operations. Exact ordinary, class, style, URL, unsafe
`srcdoc`, and form-control behavior is selected by the compiler only when it can prove the authored
property. Spreads, semantic target contributions, refs, bindings, and unproven input behavior retain
the existing generic focused operation. Render-program ABI version 5 makes that new required
operation explicit so a mismatched imported or lazy package artifact is rejected rather than
executed against the wrong call signature.

Before implementation, five accepted focused profiles attributed a median 630,392 sampled bytes
to generic `renderAttribute`. The written gate expected at least a 20% reduction at that site, at
least a 2% broad allocation reduction or an attributable focused equivalent, a non-regressing
render-only center with a promising 1-3% gain, and no normalized preloaded regression. These were
hypotheses rather than size or acceptance limits.

The accepted validation ran `npm run performance:check` exactly once after the initial focused
compiler, core, SSR, source-architecture, JSDoc, composition-corpus, and framework-comparison gates
passed. The release prerequisite passed 1,937 tests with five skips, the 335-file native compiler
corpus, maintained applications, React compatibility, Theme Lab, and framework benchmarks. The
final ABI-version correction was then rebuilt and rechecked through the focused package suites,
native compiler tests, 28-test comparison E2E suite, and a supplemental release check. The
composition corpus now records 38 compiler paths and 37 normative tests. Immutable evidence is:

- browser, 50 samples per framework:
  `.tmp/ssr-attribute-specialization/accepted/browser-50.json`;
- startup CPU and function inventory, 50 samples per framework at 1x, 4x, and 6x:
  `.tmp/ssr-attribute-specialization/accepted/startup-50.json`;
- SSR, 50 sequential samples and 50 ordinary concurrent waves:
  `framework-comparison/results/raw/ssr-2026-08-31T05-25-56-996Z.json`;
- five current focused profiles under `.tmp/ssr-attribute-specialization/focused-final-*.json`;
- the pre-implementation gate: `.tmp/ssr-attribute-specialization/expected-metrics.md`; and
- the complete current and immediate-prior control-normalized report:
  `.tmp/ssr-attribute-specialization/complete-framework-report.md`.

The client stays competitive and effectively unchanged in size: 199,054 raw and 60,706 gzip bytes,
while Brotli changes by 41 bytes to 53,008. Decoded code remains 194,551 bytes, executed code
102,115 bytes, and invoked functions 568. Startup heap remains 2,461,668 bytes at p50. The final
50-sample startup population records 19.082/19.334/20.545/21.687 ms evaluation at
p50/p75/p95/p99; eligible normalization versus the preceding server-only checkpoint moves +2.1%,
-0.3%, +0.3%, and -20.0%. Browser navigation moves -0.7%, +0.4%, and -1.2% through p95 after
eligible normalization. Optimistic feedback moves +10.8% and +6.3% at eligible p50/p75, while its
p95/p99 controls disperse beyond 1.2x. Those client timing movements are counter-metrics rather than
being attributed to the server-only operation selection.

The Exact Node server artifact changes from 217,155 to 219,993 raw bytes (+1.31%), 47,134 to
47,592 gzip bytes (+0.97%), and 39,068 to 39,430 Brotli bytes (+0.93%). Its three-file count,
4,500-byte response, rendered markup, 964-byte hydration payload, and response decomposition are
unchanged. The increase is the deterministic cost of the immutable plans, focused operations, and
explicit ABI revision; it is a counter-metric, not a hard size limit or a proxy for runtime work.

Across the final five focused profiles, median render p50 and p75 improve 2.9% and 2.1%, while p95
and p99 move +1.7% and +0.5%. Median sampled allocation falls 64,072 bytes (-0.8%). The broad
render-only population changes from 0.0453/0.0508/0.0676/0.1029 ms to
0.0460/0.0520/0.0747/0.1130 ms, so its center and tails are slower even though the focused repeated
center improves. Broad sampled allocation changes from 8,076,656 to 8,044,528 bytes (-0.4%). The
new selected root and direct attribute sites account for 461,448 and 131,816 sampled bytes in one
profile. The checkpoint therefore claims removal of repeated behavior classification and the
repeatable focused center improvement, not a broad allocation or tail-time win.

Ordinary concurrent Node throughput is 3,297/3,494/3,644/3,694 requests per second. All four
percentiles are eligible against three controls, with dispersion between 1.051x and 1.073x; the
control-normalized improvements are 7.0%, 12.7%, 14.7%, and 16.5%. Participant work improves 9.4%
and 9.6% at eligible p50/p75, p95 is ineligible, and p99 improves 43.1% after eligible
normalization. Sequential participant work improves 1.9%, 4.6%, and 2.8% through p95 after eligible
normalization; p99 controls disperse beyond 1.2x.

At preloaded c32, raw throughput changes from 4,675/4,689/4,689/4,689 to
4,682/4,787/4,787/4,787 requests per second. Render time improves from
0.1131/0.1179/0.1387/0.1889 ms to 0.1110/0.1165/0.1341/0.1803 ms. Participant work is 0.4% slower
at p50 but improves 0.6-3.6% through the remaining percentiles. This diagnostic has only React as a
control and remains raw. At equal-8-KiB c32, eligible normalized throughput improves 2.8%, 3.5%,
3.5%, and 3.5%, with participant work improving through p95 and moving +1.0% at p99. Ordinary
saturation c32 moves -1.8%, -0.6%, -0.1%, and -0.1% after eligible normalization, so the small
saturation regression remains explicit beside the ordinary and equal-payload gains.

Post-GC heap used moves +0.3%, +0.3%, +2.8%, and +2.8% after eligible normalization, and post-GC
heap total moves +0.5%, +0.5%, +1.3%, and +1.3%. The retained slope remains negative at -927 bytes
per request; its comparison cannot be normalized because controls are non-positive. No request or
component value is stored in the module-level plans. Bun remains a separate diagnostic because
Exact uses `bun-fetch` while the other participants use Bun's Node HTTP compatibility path.

The checkpoint is accepted for replacing runtime attribute-behavior rediscovery with
compiler-selected component-local operations while preserving generic semantic fallbacks, package
ABI safety, markup, security policy, and request isolation. Its server artifact growth, broad
render-only tail regression, small normalized saturation regression, retained-heap movement, and
unattributed client timing variation remain explicit counter-metrics. The next decision point is a
fresh profile of the remaining server attribute allocation—especially root-plan iteration—before
either expanding attribute specialization or returning to the deferred hydration-adoption work.

### Experimental synchronous produced-response checkpoint

The next server experiment replaces the benchmark-only callback sink with a request-owned produced
response body shared by `@exactjs/server`, compiler-closed SSR, and the real Node and Bun adapters.
The renderer publishes settled spans without constructing the former complete hydratable result.
Node retains those spans as a V8 string rope and supplies the rope to one `response.end()` call.
Request-scope cleanup transfers to the body and is released on success, failure, cancellation, or
host abort. Fetch and Bun consume the same body through their own response representation.

Focused alternatives rejected before the production-shaped candidate were per-span Node writes,
corked per-span writes, arrays followed by `join()`, an 8 KiB `Buffer.write()` slab, and a 4 KiB
string threshold. Corked writes retained only 21.3% of the string-rope adapter's paired median
throughput. The native buffer retained 94.3%, and arrays retained 96.9%. An 8 KiB string threshold
beat 4 KiB by 6.0% at the paired median for the 4,500-byte fixture. These results show that the
dominant cost is per-span response bookkeeping and redundant copying, not the final native UTF-8
encoding boundary.

After replacing the custom benchmark adapter with the production response body and removing its
unnecessary synchronous microtask, 50 alternating preloaded c32 pairs report accepted/direct
aggregate throughput of 6,127/6,307 requests per second at p50. The paired direct-to-accepted ratio
is 1.000/1.032/1.054 at p25/p50/p75 with a 1.032 mean. Direct-first and direct-second medians are
1.033 and 1.030. Aggregate total latency changes from 4.844/5.705/7.505/9.072 ms to
4.767/5.605/7.124/8.293 ms at p50/p75/p95/p99. The response remains 4,500 bytes with the accepted
hash. Absolute values reflect the contemporaneous workstation load; only the alternating paired
ratios are used for the candidate decision.

The candidate subsequently passed `npm run performance:check`, including the complete release
admission, 1,946 package tests with five skips, maintained application and documentation builds,
React compatibility, browser matrices, the native compiler corpus, and every performance suite.
Focused server, SSR, Node, Bun, composition-corpus, source-architecture, JSDoc, explicit-any, and
TypeScript 7 checks also pass. The framework-comparison collector now preserves raw evidence for
unreviewed participants, warns, and records `publishable: false`; publication policy remains in the
checkpoint/report layer instead of aborting and discarding a valid local run.

Accepted immutable evidence is:

- the written gate: `.tmp/direct-response-stream/expected-metrics.md`;
- five alternating focused profiles: `.tmp/direct-response-stream/focused-paired-5.json`;
- 50 alternating preloaded c32 pairs:
  `.tmp/direct-response-stream/paired-produced-body-sync-claim-50.json`;
- 50 interleaved ordinary c32 rounds with four frameworks and a contemporaneous Exact-before lane:
  `.tmp/direct-response-stream/four-framework-interleaved-50.json`;
- browser, 50 samples per framework:
  `.tmp/direct-response-stream/accepted-browser-50.json`;
- startup CPU and function inventory, 50 samples per framework at 1x, 4x, and 6x:
  `.tmp/direct-response-stream/accepted-startup-50.json`;
- the corrected full SSR population, including 50 sequential samples and 50 ordinary concurrent
  waves: `.tmp/direct-response-stream/accepted-ssr-corrected-50.json`; and
- the complete current and immediate-prior control-normalized report:
  `.tmp/direct-response-stream/complete-framework-report.md`.

The client artifact and deterministic startup topology are unchanged: 199,054 raw, 60,706 gzip,
53,008 Brotli, 194,551 decoded, 102,115 executed, and 568 invoked functions. Startup heap remains
2,461,668 bytes at p50. Eligible normalization reports evaluation improvements of 0.9% and 0.5% at
p50/p75; p95/p99 controls disperse beyond 1.2x. Browser navigation improves 1.0%, 5.1%, 2.7%, and
0.4% after eligible normalization, while heap is effectively identical. These are environment
counter-metrics for a server-only change, not claimed client work.

The Node server artifact grows from 219,993 to 225,111 raw bytes (+2.33%), 47,592 to 48,084 gzip
bytes (+1.03%), and 39,430 to 40,140 Brotli bytes (+1.80%). Response size, semantic hash, rendered
markup, hydration payload, and response decomposition remain unchanged. The 4,500-byte response is
produced as settled spans into a request-owned body; Node retains one V8 string rope and passes it
to one terminal `response.end()`. Bun and Fetch consume the same body through a Web stream. The
request scope is released after success, failure, cancellation, or host abort, and pre-commit
production or cleanup failures replace stale response headers with the ordinary internal-error
response.

Five alternating focused profiles report median render p50/p75/p95/p99 changes of -10.0%, -21.1%,
-12.8%, and -12.6%. Median sampled allocation falls from 8,219,920 to 7,056,096 bytes (-14.2%).
The broad corrected render-only population is 0.0515/0.0841/0.1316/0.1921 ms and 6,658,824 sampled
bytes. Its raw timing is slower than the immediately prior cross-run population while allocation is
17.2% lower; the timing conflict is retained because that lane has only React as a control. The
alternating focused result is the stronger direction signal on the actively used workstation.

At preloaded c32, 50 alternating same-worker pairs produce a direct-to-before throughput ratio of
1.000/1.032/1.054 at p25/p50/p75 with a 1.032 mean. Direct-first and direct-second medians are 1.033
and 1.030, so execution order does not explain the gain. In the 50-round four-framework ordinary
c32 experiment, the paired ratio is 0.961/1.012/1.062 at p25/p50/p75 with a 1.010 mean; direct-first
and direct-second medians are 1.013 and 1.011. Absolute ordinary values varied substantially while
the workstation was in use, so the checkpoint does not substitute raw cross-run direction for
these paired comparisons.

The complete framework population confirms useful normalized capacity movement where controls are
eligible. Node saturation c32 throughput improves 22.1%, 13.4%, 12.3%, and 12.3% through p99.
Equal-8-KiB c32 throughput improves 13.6%, 7.9%, 7.9%, and 7.9%. Equal-payload participant work
improves 8.9% and 9.5% at p50/p75, is effectively flat at p95, and regresses 9.6% at p99. Ordinary
concurrent center comparisons are ineligible because control dispersion reaches 1.9x; its eligible
p99 total latency improves 3.3%. This checkpoint therefore claims the paired throughput, focused
render/allocation, and eligible saturation/equal-payload gains, not the unstable raw ordinary
cross-run values.

Normalized post-GC heap used moves +3.6% and +3.8% at p50/p75; its p95/p99 controls are ineligible.
Post-GC heap total moves +0.1%, +0.1%, -2.1%, and -2.1%. The retained slope remains negative at
-1,268 bytes per request and cannot be normalized because controls are non-positive. No request,
component, output, or captured value is retained by a module-level artifact. The checkpoint accepts
the synchronous produced-response architecture with server artifact growth, post-GC used-heap
movement, noisy broad render tails, and equal-payload p99 participant work recorded as explicit
counter-metrics. Progressive scheduled output and backpressure remain a later executor checkpoint;
explicit string-result consumers retain the collecting surface, while production-shaped synchronous
response consumers now select the produced body without an environment-specific renderer path.

### Synchronous component-operation target checkpoint

The next remaining-site specialization removes the operations object and child-routing closure that
`SyncSsrOperationTarget` previously created for every native component receipt. The target now
implements `SyncComponentOperations` itself. Child crossings still construct their required
owner-aware target, while enhancement code receives the stable module-level child-list operation
through a prototype getter. No target, component, request, prop, state, capture, or output value is
stored in a module-level artifact.

The written gate was captured before implementation. It expected lower focused render allocation,
no response or hydration-shape change, and no client-topology movement; ordinary saturation and
retained heap remained counter-metrics. The candidate passed all 182 focused SSR tests, all 224 core
tests, all 37 composition-corpus tests, source-architecture, JSDoc, and TypeScript checks. It then
passed `npm run performance:check`, including release admission, 1,946 package tests with five
skips, framework comparison correctness, maintained applications and documentation, React
compatibility, browser matrices, and the native compiler corpus.

Accepted immutable evidence is:

- the written gate: `.tmp/sync-component-operation-target/expected-metrics.md`;
- five fresh-worker focused render/allocation captures recorded with the checkpoint evidence;
- browser, 50 samples per framework:
  `.tmp/sync-component-operation-target/accepted-browser-50.json`;
- startup CPU and function inventory, 50 samples per framework at 1x, 4x, and 6x:
  `.tmp/sync-component-operation-target/accepted-startup-50.json`;
- the full SSR population, including 50 sequential samples and 50 ordinary concurrent waves:
  `.tmp/sync-component-operation-target/accepted-ssr-50.json`; and
- the complete current and immediate-prior control-normalized report:
  `.tmp/sync-component-operation-target/complete-framework-report.md`.

Across the five focused fresh-worker captures, the median sampled allocation changes from 7,056,096
to 6,769,320 bytes (-4.1%). Median render p50 changes from 0.0611 to 0.0635 ms (+3.9%), while p75,
p95, and p99 improve 17.6%, 37.7%, and 2.2%. The complete render-only population improves from
0.0515/0.0841/0.1316/0.1921 ms to 0.0461/0.0567/0.0913/0.1128 ms at p50/p75/p95/p99. That lane
has only React as a corresponding renderer control, so these cross-run timing magnitudes remain raw.

The broad allocation sample contradicts the focused median, moving from 6,658,824 to 7,011,520
bytes (+5.3%). Site attribution nevertheless confirms that the former per-component routing
closure is gone; variation in validation, capture, component setup, and profiler attribution more
than offsets it in this one broad sample. The checkpoint therefore claims the focused allocation
direction and the eliminated allocation mechanism, not a 5.3% whole-render allocation gain.

Node preloaded c32 raw throughput moves from 4,184/4,299/4,299/4,299 to
4,926/5,014/5,014/5,014 requests per second, with participant work improving from
0.193/0.266/0.312/0.377 ms to 0.172/0.182/0.205/0.327 ms. Only React exposes the same preloaded
renderer lane, so it remains a raw diagnostic. The multi-control saturation population is mixed:
eligible normalized c32 throughput moves -14.0%/-9.6%/-8.5%/-8.5%, while c64 moves
+4.2%/+4.5%/-3.1%/-3.1%. Equal-8-KiB c32 moves -8.5%/-6.5%/-6.5%/-6.5%; c64 raw throughput
and participant work improve substantially but most percentiles are ineligible because controls
disperse. These contradictions prevent attributing broad service-capacity movement to this small
target-shape change.

The Node artifact grows by 346 raw bytes (+0.15%), 77 gzip bytes (+0.16%), and 81 Brotli bytes
(+0.20%). Response size remains 4,500 bytes, and response decomposition, semantic markup,
hydration payload, and client deterministic topology are unchanged. Control-normalized post-GC heap
used moves +0.3%/+0.3%/+1.2%/+1.2%, while post-GC RSS improves 4.5-5.2%. The retained slopes remain
negative and cannot be normalized because controls are non-positive.

The checkpoint accepts the deletion because it removes superseded per-component execution
structure, improves the focused cost it directly owns, and preserves every ABI, ownership, cleanup,
and output invariant. The broad allocation conflict, c32 saturation regressions, small artifact
growth, and retained-heap movement remain explicit counter-metrics. The next remaining-site profile
should distinguish prepared component-reference construction from state-capture and validation work
before changing another allocation site.

### Request-owned resumption path read-cell checkpoint

The next remaining-site profile separated final resumption entries from the temporary result object
allocated for every state-path segment. `readReactiveOwnPropertyInto` now reads an indexed or plain
own data property into a caller-owned cell without invoking authored accessors. Each SSR resumption
capture owns one cell, reuses it only during synchronous publication, and clears it in a `finally`
block before returning. Compact indexed entries, root-input omission, descriptor-safe authored-value
inspection, rollback, and public activation projection remain unchanged.

The candidate passed 148 reactive tests, 182 SSR tests, 224 core tests, 37 composition-corpus tests,
source architecture, JSDoc, formatting, and TypeScript 7 checks. `npm run performance:check` passed
once, including the 419-second release admission, 1,946 package tests with five skips, maintained
applications and documentation, React and R3F compatibility, the 335-file native compiler corpus,
and the complete 252-second performance profile. The four admitted framework participants then
passed all 28 browser correctness tests and were reused without rebuilding for every measurement.

Accepted immutable evidence is:

- the written gate: `.tmp/resumption-path-read-cell/expected-metrics.md`;
- ten baseline and ten candidate focused captures:
  `.tmp/resumption-path-read-cell/paired-baseline-10.json` and
  `.tmp/resumption-path-read-cell/paired-candidate-10.json`;
- browser, 50 samples per framework:
  `.tmp/resumption-path-read-cell/accepted-browser-50.json`;
- startup CPU and function inventory, 50 samples per framework at 1x, 4x, and 6x:
  `.tmp/resumption-path-read-cell/accepted-startup-50.json`;
- the full SSR population, including 50 sequential samples and 50 ordinary concurrent waves:
  `.tmp/resumption-path-read-cell/accepted-ssr-50.json`; and
- the complete current and immediate-prior control-normalized report:
  `.tmp/resumption-path-read-cell/complete-framework-report.md`.

In the contemporaneous ten-capture A/B, median `captureStateEntries` sampled allocation falls from
292,976 to 140,680 bytes (-52.0%), and total sampled allocation falls from 6,801,816 to 6,659,896
bytes (-2.1%). Render p50/p75/p95 moves +0.5%/+2.2%/+3.6%, while p99 improves 1.5%. The complete
render-only allocation sample confirms the direction: total sampled allocation falls from 7,011,520
to 6,435,992 bytes (-8.2%), and `captureStateEntries` falls from 359,008 to 128,496 bytes (-64.2%).

The broad render-only timing population contradicts the allocation result, moving from
0.0461/0.0567/0.0913/0.1128 ms to 0.0479/0.0775/0.1208/0.1933 ms. That renderer-owned lane has
only React as a corresponding control, and its raw cross-run tails disagree with the controlled
A/B. The checkpoint therefore claims the allocation reduction it directly measures, not a render
latency gain. Preloaded c32 is also raw and mixed: throughput moves from
4,926/5,014/5,014/5,014 to 4,597/4,785/4,785/4,785 requests per second, while participant work
moves from 0.172/0.182/0.205/0.327 ms to 0.179/0.192/0.270/0.373 ms.

The multi-control saturation population moves in the opposite and more favorable direction after
eligible normalization. Node throughput improves 30.7%/19.8%/6.0%/6.0% at c8,
17.7%/14.3%/11.7%/11.7% at c32, and 14.6%/13.4%/10.7%/10.7% at c64. Ordinary concurrent
throughput improves 24.2% at p50 and 11.4-12.9% at p95/p99; p75 is ineligible because controls
disperse. Equal-8-KiB c32 is raw and 6.8-10.1% lower because controls disperse, while eligible c64
throughput improves 9.0-21.1%. These mixed lanes are reported rather than reduced to one service
capacity claim.

The Node artifact changes by +162 raw bytes (+0.07%), +24 gzip bytes (+0.05%), and -12 Brotli
bytes (-0.03%). Response size remains 4,500 bytes, and response decomposition, semantic markup,
hydration payload, client artifact bytes, decoded and executed bytes, 568 invoked functions, and
startup heap remain unchanged. Normalized post-GC heap used is flat at p50/p75 and +6.8% at
p95/p99; post-GC RSS moves +6.8-7.2%. All retained slopes remain negative, and the read cell is
cleared after every publication so it cannot extend request-value reachability.

The checkpoint accepts the request-owned read cell because it deletes a repeated temporary
allocation at the measured site, preserves the descriptor-safe serialization boundary, and improves
total focused and broad allocation. Broad render tails, raw preloaded and equal-payload movement,
post-GC RSS, and small artifact movement remain explicit counter-metrics. Prepared component
references and validation now remain the largest separable construction and authored-value
inspection sites for a later experiment.

### Direct child and remaining synchronous-site focused candidates

The next focused batch first extended the existing component-local server writer only for a
compiler-proven static child with finalized plain props. The immutable writer retains the callable,
the request owns the props, and the synchronous target issues the child through its ordinary target
ABI without allocating a prepared reference. Keys, authored children, enhancements, spreads,
dynamic and lazy selection, and deferred publication retain the general operation. Render-program
ABI 6 prevents an older runtime from silently accepting the new focused operation. The composition
corpus now records 39 compiler paths and retains 37 normative tests.

Ten alternating focused pairs measured median whole-render sampled allocation falling from
6,592,060 to 6,323,620 bytes (-4.1%). Prepared-reference allocation in the exercised direct slots
fell from 160,868 bytes to zero, and child traversal fell from 333,132 to 172,296 bytes (-48.3%).
The response remained 4,500 bytes. Timing was collected while the workstation was active and is
diagnostic rather than publishable acceptance evidence. The written gate and raw captures are under
`.tmp/direct-child-issuance`.

Hydration validation then stopped constructing complete path strings for every safe value and
traverses framework-known dense tuples by index. Authored containers still require own data-property
descriptors, and only the first rejected path is formatted. Across ten alternating pairs, median
whole-render sampled allocation fell from 6,328,884 to 5,501,460 bytes (-13.1%); the former
657,624-byte `validateContainer` site disappeared and native property-descriptor attribution fell
5.4%. The response remained 4,500 bytes. Evidence is under
`.tmp/hydration-validation-paths`.

### Request-local construction and sink-publication focused candidates

Prepared server references now allocate their final request-local object directly and assign only
present optional fields. A ten-process constructor profile over 100,000 references reduced median
sampled allocation from 75,070,512 to 62,991,504 bytes (-16.1%). Prepared server render-program
invocations use the same final-object construction discipline: an escape-preserving ten-process
profile reduced median sampled allocation from 24,152,552 to 15,265,648 bytes (-36.8%), and ten
real-fixture captures removed `createPreparedServerRenderProgram` from sampled sites while reducing
median whole-render allocation from 5,542,728 to 5,386,080 bytes (-2.8%). Evidence is under
`.tmp/prepared-server-reference-allocation` and
`.tmp/prepared-server-render-program-allocation`.

The produced-response sink no longer constructs a public lazy string result that no consumer
receives. Fifty alternating pairs removed the `createChunkedStringResult` site, while paired total
allocation remained neutral at a 0.999 median ratio and diagnostic render p50/p75/p99 ratios were
0.981/0.975/0.964; p95 was 1.021. Hydration-script byte accounting now reuses the payload byte count
already computed for the security limit and adds only the small escaped envelope. Fifty alternating
pairs removed a 106,896-byte median `utf8ByteLength` site, improved paired median whole-render
allocation 0.9%, and produced diagnostic p50/p75/p95 ratios of 0.968/0.971/0.979; p99 was 1.042.
Every response and returned byte count remained 4,500 bytes. Evidence is under
`.tmp/direct-hydration-output-projection` and
`.tmp/hydration-script-byte-accounting`.

Validation now also records arrays requiring keyed reactive protocol envelopes only after their
complete contents pass the descriptor-safe boundary. Ordinary payloads use native `JSON.stringify`
without a replacer; keyed collections retain the guarded replacer and identical hashes. Fifty
alternating pairs produced consistent diagnostic render ratios of 0.916/0.929/0.935/0.950 through
p99, while paired allocation moved 1.004 at the median and 1.041 at p75. This is explicitly accepted
as a CPU-topology tradeoff rather than an allocation win. Evidence is under
`.tmp/hydration-reactive-collection-publication`.

Finally, direct-publication components no longer allocate an unused buffered-render closure, and
synchronous component setup/render enters its request domain through a direct receiver call rather
than adapter closures. Fifty-pair profiles reduced median `renderSyncComponent` allocation 9.8%
and `executeDirectSsrComponentSync` allocation 12.0%. Paired whole-render allocation medians
improved 0.7% and 1.9%, respectively. Their allocation p75 ratios of 1.028 and 1.012 and small mixed
timing tails remain counter-metrics. Evidence is under `.tmp/direct-sync-buffer-closure` and
`.tmp/direct-component-domain-call`.

The produced-response handoff now lets an environment adapter supply an immutable allocation-free
UTF-8 byte-length operation. Node supplies `Buffer.byteLength`; portable string and Fetch/Bun paths
retain the exact JavaScript scanner, and no encoded `Uint8Array` is constructed merely for
accounting. Across fifty alternating fresh-process profiles, median `charge` CPU fell from 8.584 to
3.012 sampled milliseconds (-64.9%). Diagnostic render p50/p75/p95 moved from
0.0544/0.0687/0.1257 ms to 0.0509/0.0667/0.1240 ms; p99 moved from 0.2605 to 0.2736 ms while the
workstation was active. Median sampled allocation fell 0.5%, allocation p95 fell 1.9%, and every
response remained 4,500 bytes. Evidence is under `.tmp/native-byte-length` and the corresponding
`focused-render-profile-native-byte-*` captures.

The final generic synchronous executor and its per-component sink callbacks have also been removed.
The synchronous renderer now owns setup, local-program execution, attempt checkpoints, indexed
resumption publication, lifecycle cleanup, and boundary formatting coherently; asynchronous and
scheduled execution are unchanged. Against the immediately preceding fifty-process population,
whole-render sampled allocation p25/p50/p75/p95 moved from
5,005,800/5,115,352/5,170,824/5,274,088 bytes to
4,857,376/4,917,032/5,028,776/5,107,120 bytes. The former executor and renderer accounted for
294,728 + 153,896 median sampled bytes; the folded executor accounts for 232,120 bytes. Diagnostic
render p50/p75/p95/p99 moved from 0.0509/0.0667/0.1240/0.2736 ms to
0.0467/0.0558/0.0854/0.2286 ms, but that sequential timing population was captured while the
workstation was active and is not publishable acceptance evidence. Every response remained 4,500
bytes. Evidence is under `.tmp/final-sync-executor` and the corresponding focused profile captures.

Compiler-closed sink roots now construct indexed resumption capture without the generic renderer's
instance `WeakMap` and observation wrappers. Across fifty-process before/candidate populations,
capture-construction allocation p25/p50/p75/p95 moved from
111,512/123,824/140,488/160,920 bytes to 78,376/86,728/99,032/115,480 bytes. Whole-render allocation
moved from 4,857,376/4,917,032/5,028,776/5,107,120 bytes to
4,788,448/4,919,600/5,025,048/5,165,832 bytes: neutral at the median (+0.05%), effectively flat at
p75, and 1.1% worse at p95. Diagnostic render timing was flat through p75. The specialization is
retained for its 30.0% owning-site reduction and deleted unused request structure, not claimed as a
macro render win. Every response remained 4,500 bytes. Evidence is under
`.tmp/direct-resumption-capture-construction` and the corresponding focused profile captures.

Two transfers were measured and removed. Staged optional assignment in the opaque client component
operation increased median constructor allocation 8.0%; the frozen opaque identity and WeakMap
payload retain their existing construction. Direct root-attribute spans produced a 1.001 paired
median allocation ratio and redistributed work into individual attribute calls without reducing the
whole render. Those rejection records are under `.tmp/compiled-component-operation-allocation` and
`.tmp/direct-root-attribute-spans`.

Transactional recoverable ranges were also measured and removed. The candidate retained nested
component and structural output in one request-owned indexed span store, then published the range
only after success. Across ten fresh-process profiles, median whole-render sampled allocation moved
from 4,919,600 to 4,875,368 bytes (-0.9%), below the written gate. Diagnostic p50 moved from
0.0471 to 0.0465 ms, but p75 moved from 0.0558 to 0.0563 ms while the workstation was active. The
former `bufferRange` allocation disappeared, but transaction commitment and the increased adapter
write topology replaced it; the server artifact also grew about 3.75 KiB. Every response remained
4,500 bytes and the direct sink stayed byte-for-byte identical to the string renderer. The accepted
single-rope terminal-write path is restored. Evidence is under `.tmp/transactional-ssr-spans` and
the corresponding `focused-render-profile-transactional-spans-*` captures.

These are focused candidates, not a replacement for the accepted four-framework checkpoint. The
complete browser, startup, function-inventory, artifact, Node SSR, allocation, response,
equal-payload, preloaded, saturation, retained-heap, and Bun diagnostic populations must be captured
once from admitted artifacts when the workstation is quiet, then compared with eligible controls
before this batch becomes the next published performance checkpoint.

### Progressive produced-response focused candidate

Low-level progressive responses now retain ordered string spans through an asynchronous produced
body. Node writes those strings directly to its response and awaits drain for backpressure;
Fetch-compatible environments receive a demand-driven UTF-8 stream. The high-level request handler
remains buffered where status, headers, and preload metadata must settle before commitment. The
candidate therefore changes the environment publication boundary without adding another component
renderer or weakening cancellation and request-scope cleanup.

Ten alternating fresh-process profiles, each consuming 1,000 synthetic progressive responses,
reduced median sampled allocation from 22,855,224 to 13,400,388 bytes (-41.4%). Diagnostic CPU time
fell from 28.337 to 21.281 ms (-24.9%). Both paths produced exactly 1,248,000 bytes per process. The
former Web stream controller, promise, and per-span `TextEncoder` sites disappeared from the Node
path; Fetch-compatible consumption still encodes at its adapter boundary. The written gate, runner,
and immutable captures are under `.tmp/progressive-produced-response`.

This is focused evidence rather than an accepted framework checkpoint. Workstation use makes the
CPU movement diagnostic, while allocation, output identity, response-body ownership, backpressure,
cancellation, and failure tests remain valid. The final admitted four-framework population and
control-normalized comparison remain deferred until the workstation is quiet.

### Client setup domain/scope focused candidate

The server direct-domain call was also tested at the client ownership boundary. A broad candidate
covering setup and both output executors removed three covered functions and 16 decoded bytes, but
50 cold-browser profiles moved interaction sampled allocation +9.8% at p50 and +18.8% at p75. That
form was removed rather than accepted from its synthetic microbenchmark alone.

The retained candidate applies the direct call only to durable component setup. General compiled,
watched, and fallback output remains executable through its existing ownership path. Against 50
contemporaneous baseline profiles, startup sampled allocation improves 2.0%/1.1%/3.4%/0.4%/3.3%
at p25/p50/p75/p95/p99, and retained heap falls 644 bytes. Interaction allocation is mixed at
-2.2%/+0.9%/+8.6%/-13.0%/-22.0%; setup is not re-entered during that interaction, so the p75 value
is retained as an unattributed counter-metric. Diagnostic startup CPU is mixed at
+1.2%/-0.5%/-6.7%/-7.1% from p50 through p99. The client asset grows 97 decoded bytes and its
covered function inventory remains 1,181 because one shared helper replaces the setup adapter.

The micro-profile, 50 baseline captures, 50 broad-candidate captures, 50 setup-only captures, and
written gate are under `.tmp/client-domain-scope-call`. Timing remains diagnostic while the
workstation is active; the admitted four-framework population remains deferred until it is quiet.

### Client artifact construction focused candidate

Normal client artifacts now store the same immutable capability-specific construction function
already used by finite client islands. Four comparison-fixture wrapper arrows disappear and the
compiler lowering deletes 35 net lines without adding a runtime classifier or bound function.
Across 50 fresh browser profiles, covered functions fall from 1,181 to 1,179, invoked functions
fall from 641 to 639, and retained heap falls from 1,930,300 to 1,929,240 bytes. Readable generated
output falls 195 bytes. The production and precise-executed counters each rise 14 bytes because one
shared durable helper replaces three locally inlined wrappers; this is an explicit topology
tradeoff, not a size failure. Sequential sampled allocation was mixed and provides no claimed win.
Evidence is under `.tmp/client-artifact-construction`.

### Nested indexed input projection focused candidate

The receiver input plan now accepts exact property paths rooted at one indexed prop slot. The
comparison artifact moves the three `initialData?.field` relationships into that plan while the
authored path-selection call retains its computation owner. Production and precise-executed code
both fall 122 bytes. Across 50 fresh browser profiles, covered functions fall from 1,179 to 1,173,
invoked functions fall from 639 to 633, and retained heap falls by roughly 9-11 KiB. Startup sampled
allocation is mixed: +0.37% at p50, -1.18% at p75, and +1.86% at p95. Interaction allocation also
moves upward at the center even though setup input projection is not executed by that interaction;
it remains an unattributed counter-metric from an active-workstation, exact-only population.
Evidence is under `.tmp/nested-component-inputs`. The quiet admitted four-framework population and
control-normalized comparison remain outstanding.

### Client artifact-attachment wrapper experiment

The remaining pure attachment IIFEs in readable compiler output were measured rather than assumed
to survive production admission. A candidate removed all 12 wrappers from the three comparison
components, reducing readable generated output by 788 bytes and 12 syntactic functions. The
admitted client artifact nevertheless remained exactly 194,540 bytes, with 82,327 precisely
executed bytes, 1,173 covered functions, 633 invoked functions, and unchanged retained heap.
Fifty fresh-process profiles produced mixed startup and interaction allocation. Rollup and V8
already erase the pure wrapper from the shipped execution topology, so the candidate and its added
island-binding machinery were removed. Evidence is under `.tmp/artifact-attachment-iife`.

### Synchronous operation-target reuse

The synchronous component target no longer constructs another owner-aware target at every child
component call. Component ownership was already carried by explicit parent and owner arguments,
while each component-local render program owns its request-local program target. Reusing the
already-selected operation target therefore removes duplicate request structure without mutable
target state, component classification, or any change to recursive child-list ownership.

Against the immediately preceding 50-process focused population, whole-render sampled allocation
improves 0.3%/1.7%/1.5%/1.4%/4.7% at p25/p50/p75/p95/p99. Median `directComponent` allocation
falls from 124,048 to 57,568 bytes (-53.6%). Diagnostic render p50/p75/p95 moves
-0.8%/0.0%/-0.5%; p99 is 4.6% worse while the workstation is active and is retained as a
counter-metric rather than treated as an accepted latency result. Ten confirmation processes after
restoring and rebuilding the accepted compiler source preserved the allocation direction. Every
response remained 4,500 bytes.

An immediate old/new artifact rebuild shows both Node and Bun artifacts shrinking 169 raw bytes.
Node gzip/Brotli changes by +2/+8 bytes and Bun by +5/-6 bytes, so no compressed-size improvement is
claimed. The candidate passed all 189 SSR tests, the 39-test composition corpus, the native compiler
suite during the clean compiler rebuild, and exact response identity. Evidence and the written gate
are under `.tmp/sync-operation-target-reuse`; the 50 candidate captures and ten rebuilt-compiler
confirmations are the corresponding `focused-render-profile-target-reuse-*` files under
`.tmp/output-byte-accounting`.

The adjacent native property-descriptor site was attributed before another publication change.
One instrumented comparison render issued 152 descriptor reads from descriptor-safe authored
hydration-value validation and 128 from safe nested resumption-path reads; none came from prepared
boundary snapshotting. Framework-created hydration envelopes already bypass descriptor inspection.
Removing the remaining calls would either invoke authored accessors or weaken the serialization and
resumption boundary, so no candidate was implemented for that site.

### Client final-prop construction experiment

The server-side final-object construction pattern was tested at initial client prop delivery rather
than assumed transferable. The candidate combined marked-operand resolution and authored-child
attachment into one final child prop record, removing a second object clone whenever a compiler-
indexed receipt contained reactive operands. After a mixed ten-browser result, the population was
extended to 50.

Against the immediately preceding 50-profile client checkpoint, startup sampled allocation moved
+0.5%/+0.3%/+1.7%/+2.1%/+2.1% at p25/p50/p75/p95/p99. Retained heap moved up one 2,196-byte step
at the median; covered and invoked functions stayed at 1,173 and 633. Interaction allocation was
better at the center, but initial prop construction does not execute in that interaction and the
movement is not attributed to this candidate. The optimized spread plus lazy second clone performs
better in the admitted browser topology than a mandatory mutation loop over one final record, so
the candidate was removed. Evidence is under `.tmp/client-final-prop-construction`.

### Client receipt prop-retention experiment

The accepted server prepared-reference construction was also tested one layer earlier in client
component receipt creation. The candidate retained the supplied parent-owned prop record when it
contained neither `key` nor `__exactEnhancements`, cloning only when a control field had to be
removed. This eliminated one unconditional prop clone without mutating the source object.

The first 50 captures were invalidated because the default core output rebuilt but the comparison's
target-local client variant did not; the admitted bundle was byte-identical to the baseline. After
explicitly regenerating the client/server package variants, 50 valid browser profiles showed
startup sampled allocation moving -0.2%/-0.3%/+0.3%/+1.9%/+4.7% at
p25/p50/p75/p95/p99. Interaction allocation was contradictory, including +6.6% at p50 and -2.0%
at p75. Retained heap rose 364 bytes through p75, covered and invoked functions stayed at
1,173/633, and the client artifact grew about 120 raw bytes. Diagnostic interaction CPU improved,
but workstation use and contradictory allocation do not establish a production gain. The candidate
was removed. Valid evidence uses the `browser-real-*` prefix under
`.tmp/client-component-receipt-props`; unchanged-bundle captures are retained separately as a
build-validation failure record.

Together with the earlier setup-domain and artifact-constructor experiments, these results bound
the direct server-to-client transfer surface. Client mount targets retain changing parent scope,
logical owner, and DOM insertion state, so server-style target reuse would require mutable
reentrancy state or another per-call wrapper. Nested state/prop property reads also retain their
reactive computation owners because in-place nested mutations do not advance the indexed parent
slot's dirty identity. Extending the two-field operand tuple to those reads without new nested
dependency routing would silently miss valid updates, so it is not treated as a representation-only
optimization.

### Compiler-owned static root identity focused candidate

The compiler-created `data-exact-id` on an interactive intrinsic is immutable artifact data, but
the server root plan still looked it up, normalized it, escaped it, and charged it as a dynamic
attribute on every request. The compiler now places that identity in the existing static root HTML
and static-key inventory while retaining the value in the prop record. Semantic target composition
therefore keeps its generic fallback and emits the identity exactly once when a target contribution
changes the effective prop bag. This deletes work rather than revisiting the rejected direct
root-attribute span topology.

The current admitted allocation profile attributed 366,624 sampled bytes to
`renderCompiledNativeAttributes` and 103,040 bytes to `renderCompiledNativeAttribute`. Across ten
candidate focused profiles, their combined median is 379,028 bytes, 19.3% below that admitted
sample. Whole-render sampled allocation has a 4,835,344-byte median versus the admitted
4,776,520-byte sample, so no macro allocation win is claimed without a paired population. Raw
candidate timing medians are 0.0427/0.0466/0.0614/0.1044 ms at p50/p75/p95/p99 and remain
diagnostic. Every render is byte-identical at 4,500 bytes.

The rebuilt three-file Node artifact moves from 231,989 to 232,031 raw bytes (+42), while gzip
moves from 49,425 to 49,206 (-219) and Brotli from 41,189 to 41,012 (-177). The native compiler
tests, focused SSR target-composition test, and the composition corpus pass. The corpus now records
42 compiler paths and 40 normative tests; its interactive state scenario independently protects
unchanged native attribute semantics while the compiler-structure gate requires generated identity
to remain outside the dynamic server plan. The written gate and ten focused captures are under
`.tmp/compiler-static-root-identity`.

### Successful-path hydration validation focused candidate

Descriptor-safe hydration validation now tracks property paths only after a value is rejected. The
ordinary successful pass retains prototype checks, own-property descriptors, cycle detection,
depth and node limits, structurally known framework tuples, and reactive collection registration,
but does not create or mutate diagnostic path arrays. A rejected graph reruns the same validator
with path tracking and without collection-registration side effects; if the graph changes between
passes, publication fails conservatively at `$`.

Against the immediately preceding ten-profile population, median combined sampled CPU attributed
to `validateValue`, `validateContainer`, and `pushValidationPath` moves from 5.1535 to 4.2405 ms
(-17.7%); the successful profile no longer attributes samples to `pushValidationPath`. Median
whole-render allocation moves from 4,835,344 to 4,784,816 bytes (-1.0%). Diagnostic render
p50/p75/p95/p99 moves from 0.0427/0.0466/0.0614/0.1044 ms to
0.0409/0.0448/0.0613/0.0973 ms. Every response remains byte-identical at 4,500 bytes.

The three-file Node artifact moves from 232,031 to 232,281 raw bytes (+250), 49,206 to 49,268 gzip
bytes (+62), and 41,012 to 41,041 Brotli bytes (+29). The extra diagnostic branch is retained
because it removes work from every valid request without weakening the serialization boundary or
its exact failure paths. The written gate and ten focused captures are under
`.tmp/hydration-validation-success-path`.

The adjacent hydration script escape-scan candidate was measured and removed. It retained native
`JSON.stringify` but replaced the three simple script-breaking replacements with one character-set
expression and module-level replacement function. Fifty alternating artifact pairs produced a
0.986 median allocation ratio and p95/p99 timing ratios of 0.987/0.979, but p50/p75 were both 1.006
and the hydration publication CPU ratio was 1.145. Candidate-first and candidate-second p50 ratios
were 1.005 and 1.007, so order does not explain the center regression. Exact's remaining weakness
is CPU rather than sampled allocation; the three simple native replacements are restored. The
written gate, initial ten profiles, paired artifacts, and 50-pair evidence remain under
`.tmp/hydration-script-escape-scan`.

A follow-up artifact experiment isolated the regression instead of treating the aggregate movement
as unexplained. The combined expression invoked a JavaScript replacement callback for every match,
including every common `<` in the hydration payload. A hybrid retained the native constant-string
replacement for `<` and combined only the two rare Unicode line separators. Across another 50
alternating pairs, hydration-publication CPU returned to effectively neutral at a 0.998 median ratio,
confirming that common-character callback dispatch caused the earlier CPU regression. The hybrid's
median sampled-allocation ratio was only 0.996, however, and paired p50/p75 ratios remained
1.005/1.006. The original allocation improvement therefore came from avoiding the intermediate
string created by the common `<` replacement; preserving it with the available replacement API
requires the callback work that caused the CPU loss. Moving escaping into a custom serializer would
repeat the previously rejected allocation-heavy design and unnecessarily widen the serialization
security boundary. Production retains the three native replacements. The hybrid artifact and all 50
alternating pairs remain under `.tmp/hydration-script-escape-hybrid`.

The compiler-fused root-opening candidate advances the render-program ABI to version 7 and replaces
the former root-attribute operation with one component-local operation that owns the compiler-known
opening prefix, finalized root attributes, and immediately following static segment. In the Exact
comparison server artifact this removes 38 generated static-operation calls (66 to 28) and all 19
root-attribute calls in favor of 19 root-opening calls. The compiler, direct synchronous target, and
generic semantic target all use the same operation; the superseded ABI operation is removed.

Fifty alternating immediate-before/candidate artifact pairs produce median raw render-only values of
0.0440/0.0531/0.0802/0.2235 ms before and 0.0436/0.0525/0.0779/0.2076 ms after at
p50/p75/p95/p99. Median paired ratios are 0.992/0.996/0.980/0.903, with the p50 ratio at 0.993 when
the candidate runs second and 0.989 when it runs first. The `append` allocation site falls from a
median 355,952 to 259,328 sampled bytes (-27.1%), while whole-profile sampled allocation moves from
4,632,524 to 4,686,304 bytes (+1.2% by raw medians; the median paired ratio is 1.006). The broader
increase is diffuse across native and unrelated application sites rather than the changed append
site, so it remains an explicit counter-metric rather than being attributed to the fused operation.
Every captured response remains 4,500 bytes.

A follow-up kept the fused ABI operation but published prefix, attributes, and suffix as three
separate sink spans to test whether the combined string caused that whole-profile allocation
movement. Against the one-span candidate, another 50 alternating pairs made p50/p75/p95
1.007/1.007/1.011 times slower, increased append-site sampled allocation by 43.1%, and still did not
improve total allocation (1.004 paired ratio). This shows that one settled component-local span is
the useful part of the design; restoring adapter-level writes loses the CPU and local-allocation
benefit without resolving the diffuse counter-metric. The one-span form is retained. The Node
artifact moves from 231,801 to 230,603 raw bytes (-1,198), 49,046 to 49,080 gzip bytes (+34), and
40,856 to 40,897 Brotli bytes (+41). The written gate, artifacts, and both sets of 50 alternating
pairs remain under `.tmp/compiler-root-opening` and `.tmp/compiler-root-opening-segments`.

The adjacent request-owned synchronous program-executor candidate was measured and removed. It
replaced each per-program `SyncSsrProgramTarget` with one recursively reused executor whose owner,
local output, and static-accounting state were saved on the synchronous JavaScript call stack. This
preserved request ownership and transactional restoration without pooling or module retention. A
first 50-pair population removed the old construction site's median 70,200 sampled bytes but made
p50/p75/p95 1.001/1.010/1.003 times the immediate baseline; total sampled allocation improved by a
0.991 paired ratio but was strongly order-sensitive.

A refined form removed a redundant request-context argument and identity branch, then restarted the
full 50 alternating pairs against the same admitted artifact. Its paired p50/p75/p95/p99 ratios were
1.003/0.997/1.006/1.041 and total sampled allocation was 1.002. The apparent construction allocation
was mostly attribution for inlined descendant work: the removed 74,376-byte
`renderPreparedSsrProgramString` median was accompanied by a 67,500-byte increase attributed to
`renderChildren`, with smaller shifts across child operations. Reusing mutable executor state thus
relocated attribution and inhibited otherwise effective short-lived target optimization; it did not
remove the underlying output work. The candidate also grew the Node artifact from 230,603 to 230,864
raw bytes (+261), 49,080 to 49,167 gzip (+87), and 40,897 to 40,982 Brotli (+85).

The candidate is fully removed. This result narrows the remaining boundary: deleting the target
profitably requires moving component-local output ownership into a transactional request sink, not
merely relocating the same owner/output fields onto a shared mutable object. The written gate,
artifacts, and both 50-pair populations remain under `.tmp/request-owned-sync-program-executor` and
`.tmp/request-owned-sync-program-executor-refined`.

### Compiler-fused root-opening full checkpoint

The retained one-span root-opening form completed the full four-framework checkpoint with 50
browser, startup, Node SSR, and Bun SSR samples. The immutable captures and the complete 379-KB
report are under `.tmp/root-opening-checkpoint`; the report includes every current table, every
p50/p75/p95/p99 population, immediate Exact-before comparisons, startup allocation sites, Node
response decomposition, render-only CPU and allocation sites, preloaded and service-phase
saturation, equal-payload lanes, and separate Bun diagnostics. The participant correctness suite
passed all 28 tests. The performance-profile release surface passed after three compiler tests were
updated to assert the accepted version-7 root-opening ABI instead of the removed root-attribute
operation.

Current Node saturation throughput is 2,237/2,284/2,343/2,343 requests per second at concurrency 32
and 2,190/2,322/2,327/2,327 at concurrency 64, compared with React at
2,470/2,476/2,487/2,487 and 2,442/2,442/2,469/2,469 respectively. At equal 8-KiB payload and
concurrency 32, Exact is 1,919/1,923/1,923/1,923 versus React at
2,014/2,061/2,061/2,061. The equal-payload Exact-before comparison is eligible under the unchanged
three-control rule and moves -4.6%/-3.9%/-3.9%/-3.9%. Normal saturation c32 is eligible only at
p95/p99 and moves -4.0% there; its p50/p75 controls disperse beyond 1.2x. The unrestricted concurrent
lane and most other saturation percentiles also have ineligible control dispersion, so their large
raw cross-run improvements are retained in the report but are not claimed as normalized gains.

These macro counter-signals do not reverse the focused acceptance result. The immediately
interleaved 50-pair artifact experiment isolates the changed root operation and shows faster
render-only p50/p75/p95 together with 27.1% less append-site sampled allocation. The full checkpoint
spans a restarted host and its controls moved by materially different amounts, so it cannot assign
the broader cross-run movement to a roughly one-percent root-operation change. Both observations are
kept: the focused local improvement justifies the specialization, while the eligible equal-payload
regression prevents claiming a macro throughput win from this phase.

Render-only Exact is 0.0301/0.0502/0.0660/0.0782 ms versus React at
0.0212/0.0219/0.0273/0.0379. The raw prior Exact values were
0.0456/0.0644/0.0948/0.1259, but that lane has only React as a control and therefore cannot satisfy
the two-control normalization rule. Sampled render-only allocation is 4,587,280 bytes, down from the
prior raw 4,776,520 and below React's 6,970,584. Normalized retained Node heap improves
0.8% to 1.3%, and normalized retained RSS improves 3.2% to 3.5%. The server artifact moves from
231,989 to 231,083 raw bytes (-906), 49,425 to 49,518 gzip (+93), and 41,189 to 41,272 Brotli (+83).
The 4,500-byte response and its decomposition are unchanged.

The client receives no intended execution change in this server-focused checkpoint. Executed code
remains 102,128 bytes, invoked functions remain 561, and startup heap remains 2,454,120 bytes.
Control-normalized evaluation is 4.7% slower at p50 and 9.7% slower at p75; the higher percentiles
are ineligible because the controls disperse beyond 1.2x. Navigation is likewise 4.0%/3.5%/6.2%
slower at eligible p50/p75/p95, while retained browser heap is unchanged. Those movements are
unexpected workstation/run-level counter-metrics, not attributed to the server-only root opening.

The eligible equal-payload regression was subsequently tested directly rather than allowing either
the focused render result or the cross-run normalization to decide by itself. One hundred
alternating immediate-before/current pairs served the same meaningful 8,192-byte document at
concurrency 32 through identical Node response adapters. The paired RPS ratio has a 0.998 median,
1.008 arithmetic mean, and 1.005 geometric mean; exactly 50 of 100 pairs favor each artifact. A
deterministic 20,000-resample bootstrap places the mean ratio at 0.995 through 1.020 and the median
at 0.982 through 1.018 with 95% confidence. Candidate-first and candidate-second mean ratios are
1.007 and 1.008, so measurement order does not hide a consistent loss. Total CPU per request is
also neutral: its paired median is 0.979, mean is 1.002, and both confidence intervals cross parity.

This focused population excludes a four-percent candidate regression from the changed
renderer/response path, but it does not establish a macro throughput gain. The correct disposition
is a locally useful specialization with neutral observable equal-payload throughput: retain the
operation deletion, focused render improvement, and append-allocation reduction without crediting
it for the full run's unrelated raw server improvement. The complete focused evidence is
`.tmp/root-opening-checkpoint/focused-equal-payload-100.json`.

A second 100-round population then interleaved immediate-before Exact, current Exact, and React
through three isolated repository benchmark workers. Unlike an initial discarded in-process React
adapter, this run uses the production Node adapters, per-request controlled-service fetch and
decode, the ordinary equal-payload route, separate worker processes, and a balanced rotation through
first, middle, and last measurement positions. Exact-before and Exact-current responses are
byte-identical; all three responses are meaningful and exactly 8,192 bytes.

Exact-before records 2,265/2,295/2,347/2,476 RPS and Exact-current records
2,294/2,324/2,365/2,376 at p50/p75/p95/p99; React records
2,382/2,422/2,473/2,500. Current Exact wins 65 of 100 paired rounds. Its current/before RPS ratio has
a 1.010 mean and median, with deterministic 20,000-resample 95% intervals of 1.004 through 1.015 for
the mean and 1.004 through 1.018 for the median. Exact's mean relative position moves from 94.87% of
React to 95.75%, while p50 request latency moves from 13.54 to 13.36 ms; React is 12.85 ms.

The current artifact is neutral when measured last and about 1.3% to 1.5% better when first or
middle, but every position appears 33 or 34 times and the balanced aggregate excludes parity. The
direct population therefore refines the disposition from macro-neutral to a small equal-payload
throughput improvement under the representative worker topology. It also explains why the earlier
control-normalized comparison pointed the wrong way: its approximately 1.158 control dispersion is
within the broad 1.2x publication ceiling but too large to resolve a one-percent candidate. For
effects of this size, an immediate interleaved artifact lane is the acceptance evidence; the
cross-run comparison remains environmental context. Evidence is
`.tmp/root-opening-checkpoint/worker-react-interleaved-100.json`.

### Compiler-proven static native attribute focused candidate

The current three comparison components were recompiled before implementation. Their server
programs already used compiler-selected attribute behavior, so no generic classifier remained to
remove. The live site was narrower: `maxLength={2000}` and bare `required` still occupied prepared
value slots and executed two direct attribute operations on every IncidentDetail render. The
compiler now joins those proven native constants to the existing static program segment. Dynamic
values and custom-element properties retain their runtime operations.

The three generated server components drop from six to four direct attribute calls;
IncidentDetail's generated server output shrinks 624 bytes and its generated client output shrinks
174 bytes. In admitted bundles the immediate paired artifacts move from 230,325 to 229,756 raw
server bytes (-569) and from 194,706 to 194,696 raw client bytes (-10). The rendered document stays
byte-identical at 4,479 bytes before the unchanged HTTP envelope.

Fifty alternating render-only artifact pairs are timing-neutral at the scale of this deletion. The
p50 paired ratio has a 0.983 median and 1.008 arithmetic mean because the first worker in each pair
is consistently slower; both candidate positions occur 25 times. Twenty alternating allocation
pairs show actual work removal rather than attribution movement: total sampled allocation has a
0.982 median ratio and 0.990 mean ratio, the two attribute sites have a 0.815 median ratio, and the
attribute sites plus `append` have a 0.890 median ratio and 0.962 mean ratio. Both candidate
positions improve at the combined owning sites.

The focused interleaved client gate preserves all function counts, reduces decoded and executed
code by 10 bytes, reduces retained startup heap by 44 bytes at p50/p75, and reduces browser heap by
41 to 60 bytes. Evaluation and optimistic timing are mixed sub-millisecond counter-metrics; the
static mount-only path does not execute during the optimistic interaction. The composition corpus
now records 47 compiler paths and 44 normative tests. Focused evidence and the written gate are
under `.tmp/static-native-attributes`.

### Compiler-proven static native attribute full checkpoint

The candidate completed the full four-framework checkpoint with 50 balanced, rotating browser
rounds; 50 cold-start samples per framework at each of 1x, 4x, and 6x CPU; and the complete Node
and Bun SSR populations. The 28-test participant correctness suite and the release check passed.
The native compiler corpus reported 1.08x matched-project worker time but stopped admission because
one local timing ratio was 1.66 against its 1.50 warning threshold. The already-built artifacts were
retained and the performance profile was run directly instead of discarding valid local evidence.
The raw participants remain marked unreviewed/non-publishable by metadata; that flag does not remove
or invalidate the captured diagnostic populations. Immutable evidence, normalized comparisons, and
the complete report are under `.tmp/static-native-attributes`.

The immediately interleaved historical Exact artifact is the decisive server counter-metric. At
concurrency 16, current Exact moves +1.1%/+3.1%/+3.8%/+0.0% against Exact-before at
p50/p75/p95/p99. Saturation c32 is -0.0%/+0.6%/-0.6%/-0.6%; preloaded c32 is
+1.2%/-2.6%/-2.6%/-2.6%; and equal-8-KiB c32 is -1.1%/+3.1%/+3.1%/+3.1%.
The mixed signs and small magnitudes confirm that removing two prepared attribute operations does
not create a material macro throughput regression or gain. Current Node Exact reaches
1,703/1,849/2,035/2,301 RPS in the concurrency-16 population, compared with React at
1,791/1,935/2,079/2,551. At saturation c32 Exact reaches
1,967/2,005/2,015/2,015 RPS versus React at 2,032/2,071/2,165/2,165. At equal 8-KiB c32 Exact is
1,818/1,900/1,900/1,900 RPS versus React at 1,912/1,935/1,935/1,935. The remaining preloaded c32
gap is larger: Exact records 5,081/5,156/5,156/5,156 RPS versus React at
6,240/6,836/6,836/6,836.

The full render-only profile records Exact at 0.0478/0.0601/0.0972/0.1772 ms and React at
0.0244/0.0269/0.0433/0.1204 ms. Exact samples 4,556,904 transient allocation bytes, slightly below
the prior run's raw 4,567,728 and well below React's 6,981,264. Site attribution moves in both
directions in this single stochastic profile, so it does not replace the focused paired allocation
population: there, the affected attribute sites improve in both execution positions and the owning
attribute-plus-append region falls by a 0.890 median ratio. Post-GC Exact heap is 12.53 MB versus
React at 13.15 MB, SvelteKit at 14.15 MB, and Nuxt at 18.00 MB. Exact's fitted heap slope is 3,255
bytes per request versus React at 3,203, SvelteKit at 4,336, and Nuxt at 3,943.

Client deterministic counters move only with the folded constants: decoded client code falls from
194,706 to 194,696 bytes and executed code from 102,294 to 102,284 bytes; invoked functions remain 561. Startup heap is 2,456,384 bytes and browser retained heap is 2,602,112 bytes, both effectively
unchanged after control normalization. Evaluation records 20.711/21.785/22.933/25.043 ms; eligible
normalized p50/p75/p95 comparisons improve 2.6%/4.4%/6.4%, while p99 is ineligible because control
dispersion exceeds 1.2x. Optimistic feedback is 1.6/1.8/2.6/3.7 ms. Its eligible p50/p75 values
improve 1.7%/0.7%, p95 is ineligible, and p99 regresses 25.4%. The folded static mount attributes
are not executed in that interaction, so neither the central improvement nor the tail regression is
attributed to this compiler change. The 4,479-byte document, 4,500-byte HTTP response, listener
count, and all response semantics remain unchanged.

The full Node artifact moves from 231,172 to 230,236 raw bytes (-936), including the separately
accepted request-owned server prop-forwarding correction; the isolated static-attribute entry-file
change is -569 raw bytes. The client entry changes by -10 bytes. The candidate is retained because
it deletes proven-unnecessary runtime work, reduces both target artifacts, preserves every semantic
and ownership boundary, improves the isolated allocation owner, and is macro-neutral when measured
against the historical artifact in the same run.

### Rejected shape-aware direct resumption validation experiment

The experiment made direct compiler-closed resumptions validate their framework-created envelope
and indexed tuple shape without first registering every tuple container in a request-local identity set. Authored
state and context values still cross the complete descriptor-safe validation boundary, including
prototype, accessor, cycle, node-count, depth, DOM-node, and reactive-collection checks. Generic
resumptions and selected output extensions retain the generic path. The change removes structural
bookkeeping rather than trusting authored values or adding a second serializer.

The first candidate was rejected after profiling explained its neutral aggregate result. It added
each framework tuple to a `WeakSet` while constructing the response, moving the later structural
walk into native `WeakSet.add` work. Native set-add allocation rose by roughly 39%, p75 and p95
render time worsened, and total sampled allocation was neutral. A second shape-aware form initially
used callbacks for known tuple edges; those per-edge closures increased total sampled allocation by
roughly 9%. Both mechanisms were removed before the final experiment. That implementation traversed
the known tuple fields directly and allocated neither an identity registry nor per-edge callbacks.

Across 100 alternating immediate-before/current render pairs, the retained candidate's median
paired ratios are 0.960/0.958/0.965 at p50/p75/p95. The isolated p99 ratio is 1.016, but p99.5 is
0.986 and every counted slow-sample threshold from 0.1 through 1 ms improves; the p99 movement is a
percentile-boundary effect rather than added tail mass. Twenty paired allocation profiles reduce
total sampled allocation by 1.3% to 1.6%, cut native `WeakSet.add` attribution from a median 242,456
to 118,200 bytes, and remove the former direct-hydration structural registration site. A direct
profile moves from 0.0467/0.0618/0.1252 to 0.0439/0.0564/0.1154 ms at p50/p75/p95 and from
4,599,112 to 4,362,224 sampled bytes. The response remains 4,479 document bytes and 4,500 HTTP
bytes. The Node server entry grows from 229,756 to 232,514 raw bytes; this server-only code growth
is recorded as a counter-metric, not treated as a client payload regression.

Twenty alternating focused preloaded-throughput pairs improve by 2.5% at the paired median and 5.4%
at the arithmetic mean, with the current artifact winning 16 pairs. The ordinary equal-payload lane
is 0.9% lower at the median while its controlled data load drifts across rounds. Repeating the
preloaded render with an 8-KiB response isolates the response path and improves 1.4% at the paired
median and 0.5% at the mean in both execution orders. These populations show that the validation
deletion improves render work without merely transferring it to padding, response publication, or
garbage collection.

The complete four-framework checkpoint used 50 balanced browser rounds, 50 cold starts per
framework at 1x/4x/6x CPU, and balanced Node and Bun participant rotation. Its broad Node
Exact-before lanes contradict the focused result: current preloaded c32 records
5,079/5,255/5,255/5,255 RPS versus 5,377/5,534/5,534/5,534 before, while equal-8-KiB c32 records
1,623/1,649/1,649/1,649 versus 1,730/1,775/1,775/1,775. That signal was investigated with longer
alternating populations and restarted worker cohorts. Those cohorts did not reproduce the loss,
which exposes process-placement sensitivity in the artifact lane, but they do not override the
checkpoint's own complete same-run counter-signal. The full concurrent population attributes most of the movement outside the
changed site: p50 data load rises from 4.93 to 6.49 ms, total CPU per request rises from 0.916 to
1.171 ms, and garbage collections rise from 4 to 25. The preloaded and equal-payload saturation
lanes contain only three throughput windows each, whereas the focused populations contain 20
alternating pairs and improve in both candidate positions. Because every published concurrent RPS
percentile moved backward against the immediately interleaved Exact-before artifact, the complete
counter-signal controls the disposition: the experiment is rejected and its implementation removed.

Current four-framework Node saturation c32 is 1,714/1,799/1,883/1,883 RPS for Exact,
2,095/2,101/2,234/2,234 for React, 1,287/1,321/1,416/1,416 for SvelteKit, and
815/896/915/915 for Nuxt. Render-only Exact is 0.0482/0.0645/0.1369/0.2668 ms versus React at
0.0256/0.0297/0.0609/0.1842. Sampled render-only allocation is 4,471,440 bytes for Exact. Post-GC
heap is 12.55 MB for Exact versus 13.15 MB for React, 14.15 MB for SvelteKit, and 18.00 MB for Nuxt;
the fitted Exact heap slope is 3,288 bytes per request versus React at 3,036. Client code,
function inventory, and retained browser heap were unchanged by this server-only experiment. The
complete [metrics report](component-local-target-abi-shape-aware-resumption-validation.md) remains
tracked as rejected evidence rather than accepted history. Its immutable raw evidence remains under
`.tmp/resumption-structural-trust`.

### Compact direct resumption shape-state checkpoint

The rejected validation experiment was revisited from the restored 229,756-byte server artifact,
not from its unaccepted implementation. The earlier form added 2,758 raw server bytes and several
hot helper functions to remove request-local structural-known bookkeeping. The revised candidate
carries one numeric compiler-owned container shape through the existing validation recursion and
returns to the descriptor-safe path as soon as traversal reaches an authored value. It adds no
callbacks, identity registry, serializer, or helper stack. Prototype, accessor, cycle, depth,
node-count, DOM-node, reactive-collection, extension, and request-isolation boundaries remain.

The rebuilt production server entry is 229,778 bytes, only 22 bytes above the byte-identical
restored artifact. The client artifact is byte-identical. The current comparison response is 4,479
bytes, the same byte-for-byte response measured from this candidate and the rejected predecessor;
the 21-byte reduction from the older 4,500-byte checkpoint belongs to the intervening accepted
server work and is not attributed to validation. Across 100
alternating render-only pairs, candidate/before median ratios are 0.959/0.971/0.970/1.001 at
p50/p75/p95/p99; arithmetic means are 0.958/0.962/0.978/0.997. The candidate wins 72, 68, 61, and
50 pairs respectively, with the center improvement present in both execution positions. Twenty
alternating allocation pairs record a 0.950 median and 0.946 mean total sampled-allocation ratio,
with 19 pairs improving. Median native `WeakSet.add` attribution falls from 225,512 to 143,760
sampled bytes.

Ten restarted five-round worker cohorts do not reproduce the rejected all-lane throughput pattern.
Candidate/before cohort-mean ratios are 1.001 for concurrent c16, 1.016 for saturation c32, 1.010
for preloaded c32, and 0.993 for equal-8-KiB c32. Because the first equal-payload population moves
with worker start position, a longer 20-cohort, four-window confirmation was run instead of
dismissing the counter-signal. Its balanced aggregate records a 1.012 cohort-mean ratio, 1.019
cohort median, 11 of 20 winning cohorts, a 1.017 paired-window mean, and 44 of 80 winning windows.
The persistent start-position split confirms process-placement sensitivity; balancing it removes
the apparent aggregate regression but does not justify crediting the candidate for an equal-payload
gain.

The complete release prerequisite and `npm run performance:check` passed. Because this change is
server-only and the production client asset is SHA-256-identical, the complete report reuses the
same 50-sample browser and startup captures and measures a new 50-sample Node/Bun SSR population
from the rebuilt admitted server artifacts. The complete
[metrics report](component-local-target-abi-compact-resumption-shape-state.md) includes every
browser, startup CPU, function-inventory, artifact, Node SSR, allocation, response-decomposition,
equal-payload, preloaded, saturation, retention, and Bun diagnostic table.

The controlling immediate Exact-before population does not reproduce the rejected coherent
all-lane regression. Current/before requests-per-second ratios are positive in unrestricted c16 and
ordinary saturation c1 through c64. Preloaded c32 and c64 have mixed centers and tails, and
equal-8-KiB c32 is 6.2-6.3% lower while c8 and c64 improve. The much larger 3.6-35.4% ordinary-lane
movements cannot plausibly come from this 22-byte change; together with the restarted-cohort
experiment, they expose persistent worker-placement sensitivity. They are therefore a veto check,
not claimed optimization credit. The attributable evidence remains the alternating render and
allocation populations: roughly 4% faster center rendering, about 5% lower sampled allocation,
and removal of request-local structural-registration work without weakening authored-value
validation.

Current Node Exact and React are effectively level in unrestricted concurrent p50 at 1,597 and
1,582 requests per second. Exact leads React at ordinary saturation c32
(1,834/1,916/2,009/2,009 versus 1,790/1,880/1,930/1,930) but trails in some lower-concurrency lanes.
Render-only remains slower at 0.0656/0.0793/0.1222/0.2425 ms versus React at
0.0277/0.0325/0.0761/0.1681, while sampled render allocation remains materially lower at 4.59 MB
versus 6.98 MB. The compact shape-state implementation is accepted on the focused CPU/allocation
evidence and the absence of a coherent broad throughput veto. Immutable evidence and the written
gate are under `.tmp/direct-resumption-shape-state`.

### Single root resumption token cleanup

The capture's root-input token registry could contain at most one value but used both a
request-local `Set<number>` and a separate claimed flag. One optional numeric token now owns claim,
publication, and rollback state. This removes a container and its add/has/delete operations without
changing record order, nested same-artifact treatment, replacement attempts, or descriptor-safe
state reads. A focused rollback test proves that only the first matching record receives root-input
omission and that rolling back its token permits the replacement attempt to claim it.

The Node server entry falls from 229,778 to 229,628 raw bytes. Twenty alternating allocation pairs
move from a 4,995,616-byte median to 4,941,312 bytes; the paired median ratio is 0.990, the mean is
0.995, and 11 of 20 pairs improve. The initial 100-pair timing population appeared 3.5-5.4% faster,
but its candidate worker always started second. Twenty restarted five-round cohorts remove that
placement bias: candidate/before mean ratios are 0.997/1.020/1.007/0.992 at p50/p75/p95/p99.

An identical-artifact A/A population explains the apparent p75 counter-signal. It records mean
ratios of 1.001/1.014/1.010/1.014 at p50/p75/p95/p99 and large start-position splits of its own.
Relative to that control, the token cleanup is effectively neutral through p95 and does not support
the original large CPU claim. It is retained as a deletion-oriented request-allocation cleanup:
one fewer request object, 150 fewer server bytes, a small paired allocation improvement, and no
attributable timing regression. Every measured response remains byte-identical at 4,479 bytes; all
194 package-owned SSR tests pass. The written gate, artifacts, alternating profiles, restarted
cohorts, and A/A control are under `.tmp/resumption-root-token`.

### Exact snapshot resumption-input specialization

The compiler now recognizes a zero-argument, expression-bodied `peek(() => props.path)` setup
snapshot as an exact resumption input. Arbitrary snapshot calculations remain executable and do not
receive this proof. Synchronous capture omits a nested state entry only when its finalized prop and
captured state remain identical; a divergent task or interaction value is still serialized. Root
records retain the additional published-root-props identity check. State-input paths authorize this
server omission but are unused by hydration, so client contracts now emit the required empty field
instead of shipping descriptive server facts.

The composition corpus records 48 compiler paths and 45 normative tests. Its nested snapshot
scenario independently protects server metadata, payload omission, matching hydration, and adopted
DOM identity. Focused SSR tests also cover divergent nested state and root rollback.

Deterministic comparison-fixture movement is favorable on both sides of the boundary. Hydration
payload falls from 964 to 943 bytes, the rendered body falls 21 bytes, and the complete HTTP response
therefore falls from 4,479 to 4,458 bytes. Client JavaScript falls from 194,696 to 194,583 raw bytes,
and precise executed code falls from 82,439 to 82,326 bytes. Profiled and invoked functions remain
1,173 and 633. The Node entry grows from 229,771 to 229,878 raw bytes; server code growth is recorded
but is not a client payload concern.

Twenty alternating allocation pairs are neutral overall: the paired median ratio is 0.990, the
mean is 1.000, and 12 of 20 pairs improve. Serialization attribution falls with the payload while
the new proof lookup redistributes capture samples. Ten restarted, balanced concurrent cohorts
record candidate/before RPS median ratios of 1.018 at c8, 1.021 at c32, and 0.999 at c64; means are
1.017, 1.010, and 0.999. The candidate wins 8, 6, and 5 cohorts respectively. c8 and c32 remain
positive in both worker-start positions, while c64 is neutral.

Thirty alternating cold-browser pairs record a 2.1% lower startup-allocation median and 1.6% lower
paired mean. Retained JS heap moves from 1,920,384 to 1,919,964 bytes at the median, with 21 of 30
pairs improving. Interaction CPU and sampled allocation are noisy around a neutral center; the
changed metadata is not executed during that interaction, and no interaction gain or regression is
attributed to it. The specialization is retained for the deterministic response/client reductions,
small retained-heap improvement, positive c8/c32 capacity evidence, and neutral c64 result. Written
gates, immediately preceding artifacts, allocation profiles, concurrent cohorts, and browser pairs
are under `.tmp/resumption-empty-capabilities` and `.tmp/nested-resumption-input-omission`.

### Indexed intrinsic operands and reconstructible resumption omission

The focused client property operation now consumes compiler-proven direct state and prop operands
from the existing component-local wire. Mixed groups retain executable functions only for their
arbitrary expressions and callbacks; there is no application-wide interpreter, bound-function
substitute, or per-instance operand array. The mounted property group retains no operand-plan
reference and reads its immutable tuple from the selected wire only when the indexed dependency is
dirty. The composition corpus records 49 compiler paths and 50 normative tests, including direct
state, direct prop, forwarding, keyed rows, form projection, replacement, hydration, and
arbitrary-expression fallback.

The same compiler checkpoint proves when a transition-free synchronous component's complete
hydration state is reconstructed by exact finalized prop inputs and unconditional primitive setup
defaults. Such a component emits no resumption contract, reserves no server capture record, and
requires no synthetic hydration activation. Components with uncovered state, authored
calculations, continuations, lifecycle work, contexts, or scheduled work retain the existing
request-owned capture path. The current comparison response is 4,314 bytes: 4,100 rendered bytes
and a 214-byte document envelope. Its hydration payload is 799 bytes, including 69 resumption
bytes. This is 144 response bytes below the preceding 4,458-byte accepted snapshot-input
checkpoint.

Against the saved pre-operand/pre-omission client, precise executed code falls from 82,155 to
81,652 bytes while profiled and invoked functions remain 1,173 and 633. The production client is
194,057 raw bytes and the Node server entry is 231,831 raw bytes. Fifty alternating cold-browser
pairs put retained heap at 1,898,276 bytes versus 1,897,452 before, an 824-byte increase; startup
allocation falls from 1,212,200 to 1,188,528 bytes at the median. That small retained counter-cost
was investigated through heap dominators and by removing the per-instance operand reference. The
remaining movement is code/module metadata rather than retained component data. A 100-pair actual
interaction population keeps optimistic feedback at 1.4/1.5 ms through p25/p50 while p75/p95/p99
improve from 1.6/1.9/2.1 to 1.5/1.7/1.8 ms. Settlement is effectively neutral.

Focused server evidence isolates the resumption omission from broader machine movement. Twenty
alternating allocation pairs have a 0.964 mean candidate/before ratio and a 0.956 median ratio,
with 14 pairs improving. One hundred alternating render pairs have a 0.989 mean and 0.983 median
ratio, with 67 pairs improving. Ten restarted three-window cohorts are neutral to modestly positive
at the capacity target: mean RPS ratios are 1.002 at c32 and 1.005 at c64. These results support the
allocation and payload deletion without claiming a throughput breakthrough. The complete release
prerequisite and `npm run performance:check` pass from the rebuilt source state.

### Shared value-free stateless server receiver

Compiler-proven stateless components no longer allocate a `{ state: {}, map }` request frame when
inspection callbacks are absent. An earlier `undefined`-receiver experiment was rejected after it
made the hot component callsite polymorphic and regressed render work. The retained refinement uses
one frozen, value-free receiver with the same object shape at the existing callsite. It contains no
request, component, prop, state, capture, or output value and cannot be mutated. Observed,
stateful, context, lifecycle, and scheduled artifacts remain on request-owned frames.

Twenty alternating allocation pairs move from a 4,584,680-byte median to 4,527,704 bytes; the
paired mean ratio is 0.988, the median ratio is 0.990, and 13 pairs improve. One hundred alternating
render pairs have a 0.990 mean and 0.979 median ratio, with 53 pairs improving. Ten balanced
three-window concurrent cohorts are mixed rather than coherently regressive: mean RPS ratios are
0.991 at c8, 1.009 at c32, and 1.023 at c64. A separate identical-artifact population confirms
large worker-position effects, so no throughput gain is credited. The change is retained as an
approximately 1.2% sampled-allocation deletion with neutral capacity evidence at the primary
c32/c64 lanes. Its focused gate and immutable evidence are under `.tmp/stateless-split-callsite`.

### Indexed hydration resumption lookup

Hydration's ordered resumption resolver now searches its dense request-derived activation array
with one inline index rather than allocating and invoking a `findIndex` callback for every
resumable component. First matching component identity, consumed records, duplicate identities,
checkpoint rollback, replacement, and missing-record diagnostics retain their existing behavior.

The initial `for` form was not retained: although it removed the callback, 50 alternating profiles
showed a 3.3% startup sampled-allocation increase attributed primarily to V8 compile/evaluation
buckets. A tighter `while` form removes the extra live loop local. In its independent 50-pair run,
profiled functions fall from 1,173 to 1,172 and invoked functions from 633 to 632 in every sample.
Retained heap falls from 1,898,276 to 1,898,008 bytes at the stable median, with 46 of 50 pairs
improving. Startup sampled allocation is neutral at a 1.005 paired mean ratio with 27 pairs
improving, and interaction CPU is neutral. The client artifact grows by 18 raw bytes and precise
executed code by 14 bytes. The change is retained for the deterministic function and retained-heap
deletion; its two implementation-shape populations are under
`.tmp/hydration-resumption-index-search`.

### Reaction dependency ownership arrays

Reactive dependency subscriber sets remain the authoritative deduplication boundary. The reverse
collection owned by each watcher or computed node now uses a dense array because it only supports
append after a successful subscriber-set insertion, ordered cleanup iteration, emptiness checks,
and reset. Direct multi-key subscriptions convert their already-deduplicated setup set once. This
does not change invalidation, batching, computed settlement, rollback, observation hooks, or scope
disposal.

All 148 reactive tests pass. Fifty alternating cold-browser pairs keep startup allocation neutral
at a 1.002 paired mean ratio and reduce retained heap from 1,898,008 to 1,897,612 bytes at the stable
median, with 37 pairs improving. The production client and precise executed code each fall by one
byte; function inventory is unchanged. One hundred alternating user-visible interaction pairs keep
optimistic feedback at 1.4/1.5/1.6 ms through p25/p50/p75 and improve p95/p99 from 1.9/2.1 to
1.7/1.9 ms. Settlement remains 14.0 ms at p50 and is noise-scale at the paired mean. The change is
retained for its container simplification and retained-heap reduction; evidence is under
`.tmp/client-reaction-dependency-array`.

### Remaining synchronous server-site cleanup

Fresh site-specific experiments retained five narrow server changes already represented in the
current executor: server invocations no longer retain the unused client reader table; dense
compiler-owned attribute plans, synchronous child arrays, and resumption schemas use indexed
traversal; and compiler-proven synchronous roots do not construct an async scheduler. Async and
generic iterable paths remain unchanged, and all mutable scheduler, frame, capture, and output
state stays request-owned.

The strongest isolated result is indexed child traversal: twenty alternating pairs have a 0.966
sampled-allocation mean ratio with 17 wins and a 0.968 render mean ratio; fifty balanced windows
record RPS mean ratios of 1.008 at c32 and 1.011 at c64. Indexed resumption traversal has a 0.970
allocation mean ratio and neutral-to-positive capacity (1.003/1.007 at c32/c64). Attribute-plan
indexing is allocation-neutral overall but reduces its median by 73,476 bytes and records
1.008/1.001 capacity ratios. Eager invocation and scheduler omission are smaller neutral-to-positive
cleanups. Server code growth is modest and is not treated as client payload.

Final-object SSR context construction was also tried and removed. It produced faster isolated
render samples but increased median sampled allocation by 56,864 bytes and was slightly negative at
c64, failing the mechanism's stated purpose. Written gates and immutable populations are under the
corresponding `.tmp/server-*`, `.tmp/sync-context-scheduler-omission`, and
`.tmp/ssr-context-final-construction` directories.

### Environment-accounted compiler attributes

The synchronous component-local writer no longer escapes a compiler-classified attribute and then
asks the byte ledger to reread the completed string. Its focused attribute operation first checks
whether the finalized value contains an HTML attribute delimiter. Already-safe values remain raw;
values containing `&`, `<`, `>`, or `"` retain canonical escaping. The environment-owned exact byte
operation accounts the finalized span, and the response adapter still performs final UTF-8 encoding.
Generic attributes, URL sanitization, class/style normalization, unsafe-HTML policy, character and
byte limits, rollback, and output order retain their existing paths.

The first candidate counted UTF-8 in a JavaScript loop and was refined after considering the native
response boundary. Ten alternating profiles show the environment-assisted version at a 0.938
sampled-allocation mean ratio with all ten pairs improving; profiled render work has a 0.947 mean
ratio with nine wins. The former `escapeAttr` allocation site disappears for safe values, and the
replacement attribute site is about 30% smaller than the JavaScript-loop candidate. One hundred
alternating render pairs improve p50/p75/p95/p99 from 0.0329/0.0498/0.0728/0.1016 ms to
0.0319/0.0473/0.0700/0.0952 ms. The paired median ratio is 0.969 with 68 wins.

Thirty interleaved preloaded throughput pairs improve mean c32 from 7,150 to 7,325 RPS and mean c64
from 7,090 to 7,250 RPS. Paired mean ratios are 1.025 and 1.024, with 27 and 28 wins. Every response
remains 4,314 bytes. The client artifact remains 194,074 raw bytes; the Node server entry grows from
231,831 to 233,036 raw bytes, which is recorded but not treated as a client payload cost. The written
gate and immutable profiles are under `.tmp/accounted-compiled-attributes`.

### Guarded primitive attribute serialization

Compiler-selected ordinary and class attributes now bypass reactive unwrapping, recursive class
normalization, null/object handling, and general coercion only when the runtime value is already a
primitive string. This is a runtime proof rather than trust in an erased TypeScript annotation.
Every non-string value and every style, URL, unsafe-HTML, date, or generic kind retains the complete
serializer and its security policy.

The first ten profiled pairs appeared 4.1% slower, so the candidate was not judged from that small
population. One hundred alternating render pairs instead improve p50/p75/p95/p99 from
0.0319/0.0480/0.0698/0.0947 ms to 0.0302/0.0468/0.0688/0.0933 ms. The paired mean ratio is 0.964,
the median ratio is 0.953, and 80 pairs improve. Allocation is neutral at a 0.994 paired mean ratio.
Across separate 30- and 50-round interleaved populations, combined paired RPS movement is about
+0.25% at c32 and +0.21% at c64; no independent concurrency gain is claimed. The specialization is
retained as removed render work with neutral capacity evidence. Descriptor-safe traversal of
authored hydration values remains necessary: its accessor, prototype, cycle, depth, and node checks
cannot be removed merely because the surrounding envelope is compiler-created. Evidence is under
`.tmp/compiled-primitive-attribute-fastpath`.

### Accounted-attribute complete comparison checkpoint

The accepted artifact was measured with 50 balanced, round-interleaved samples in each browser,
startup, Node SSR, and Bun diagnostic population. The admitted participants were built once and
reused. The [complete grouped-percentile report](component-local-target-abi/accounted-attributes.md)
keeps frameworks in Exact, React, SvelteKit, Nuxt order and includes raw current values, eligible
control-normalized Exact-before values with their raw historical values, every browser and startup
population, function and artifact inventories, Node SSR lanes, allocation and response
decomposition, equal-payload and saturation lanes, and Bun separately. The immutable SSR evidence
is `framework-comparison/results/raw/ssr-2026-09-02T02-55-43-715Z.json`. Browser and startup source
captures remain under `.tmp/final-accounted-checkpoint`.

The current browser transfers 194,374 script bytes, down from the deterministic 194,840-byte
history. Precise executed code is 101,697 bytes in the balanced browser population and 101,636
bytes in the controlled startup populations, versus 102,128 bytes before. The corresponding
invoked-function populations are 562 and 560 versus 561 before, so the client work removed in this
checkpoint is code and retained data rather than a broad function-topology reduction. Warm used
heap is 2,577,544 bytes at p50 versus a 2,599,848-byte normalized and raw before value. Cold-start
used heap is 2,432,584 bytes versus 2,454,120 before. Optimistic feedback is
1.5/1.7/1.8/2.0 ms at p50/p75/p95/p99; its normalized historical p50/p75 are 1.4605/1.6232 ms, while
the historical upper tail is ineligible because the controls dispersed. The checkpoint therefore
records a real heap and deterministic-code improvement, but no optimistic-feedback win.

Node startup favors Exact at 236.5 ms p50 versus React at 253.0 ms. Ordinary c16 concurrent SSR is
2,081.7 RPS at p50 versus React at 2,135.0 RPS, a 2.5% gap. At the sustained capacity target, c32
is effectively tied at 2,420.3 versus 2,422.9 RPS and c64 favors Exact at 2,378.1 versus 2,302.9
RPS. Equal-8-KiB c32 favors Exact by 0.7% at p50, while c64 trails React by 0.9%. Direct
interleaved before/current preloaded lanes improve by 7.7% at c32 and 3.2% at c64 at p50; their
p75-through-p99 gains are 8.9% and 4.6%. Exact retains the lowest post-GC heap of the four
participants at 12.48 MB p50, versus React at 13.15 MB, SvelteKit at 14.16 MB, and Nuxt at 17.99
MB. Render-only work remains weaker at 0.0342 ms p50 versus React at 0.0231 ms.

The response is 4,314 bytes versus React's 3,384, SvelteKit's 4,062, and Nuxt's 4,462. Exact and
React semantic markup are nearly equal at 2,392 and 2,383 bytes. Exact's remaining response gap is
principally 685 marker-comment bytes, 160 identity-attribute bytes, and an 863-byte hydration
script containing a 799-byte payload. Those protocol bytes, not application markup, are the next
payload question.

### Authored hydration validation ceiling experiment

Validation was temporarily removed from an otherwise identical server artifact to measure the
maximum available benefit; the candidate was explicitly unsafe and was restored after measurement.
With the switch itself removed from the hot path, 100 alternating render pairs improved
p50/p75/p95/p99 from 0.0310/0.0479/0.0702/0.0962 ms to
0.0277/0.0422/0.0618/0.0871 ms. The paired median ratio was 0.903 with 91 wins. Fifty balanced
concurrent pairs improved mean c32 from 7,381 to 7,759 RPS and c64 from 7,336 to 7,686 RPS,
increases of 5.1% and 4.8%; paired median changes were 6.2% and 6.3%.

The experiment establishes a material ceiling but does not justify deleting the boundary. The
direct envelope and compiler-created resumption tuples already avoid descriptor inspection. In the
comparison fixture, reconstructible prop inputs are also omitted from child capture, so the large
authored `initialData` graph is not redundantly traversed through resumptions. The remaining work
rejects accessors and hostile prototypes, detects cycles, and enforces depth and node limits before
native `JSON.stringify` can invoke authored behavior or perform unbounded traversal. A safe follow-up
would require trustworthy provenance established at an earlier server-data boundary and tied to an
immutable value or already-validated serialized bytes. A completed-object cache alone is
insufficient because it would weaken occurrence-based depth/node limits for shared subgraphs.
Evidence is under `.tmp/unsafe-hydration-validation`.

### Direct indexed client resumption activation

The compact document lane previously converted each indexed resumption tuple into `@index` state
and context records, then allocated a second activation with named records after the receiving
component contract became known. The retained candidate keeps the decoded field-pair arrays
request-owned, validates them against that component's immutable schema, resolves their field cells
in place, and applies state and contexts from the same arrays. Explicit application registrations
retain named records. Numeric/name aliases, undeclared fields, continuation authorization, ordered
consumption, rollback, replacement, and recovery remain fail-closed.

The first implementation hid pairs behind per-activation symbol metadata. Although correctness
passed, the framework-comparison artifact grew by 146 raw bytes and the controlled population added
three profiled and two invoked functions. That wrapper was removed before acceptance. The focused
representation instead removes 34 raw client bytes, 187 precise executed bytes, two profiled
functions, and three invoked functions. Across 50 alternating cold-browser pairs, retained heap
falls by exactly 2,952 bytes in every pair. Startup CPU is neutral at a 0.995 paired mean ratio;
sampled startup allocation is inconclusive at a 1.016 paired mean ratio with 20 wins.

The interaction code does not enter resumption parsing or activation after startup. Its sampled
allocation moved upward with only 22 of 50 candidate wins while retained heap, executed code, and
function counts changed deterministically in the intended direction. Allocation-site identities
also shifted with minified offsets while corresponding before/current sites exchanged similar
sample totals. The interaction allocation movement is therefore recorded as sampling/code-layout
noise rather than attributed to moved runtime work; interaction CPU is neutral at a 1.013 paired
mean ratio with 31 wins. The complete focused evidence and written counter-metrics are under
`.tmp/client-indexed-resumption-direct`.

### Direct indexed resumption complete comparison checkpoint

The accepted artifact was measured with 50 balanced, round-interleaved samples in every browser
and controlled-startup population, plus the complete fresh Node SSR and Bun diagnostic suite. The
four admitted participants were built once and reused. The
[complete grouped-percentile report](component-local-target-abi/direct-indexed-resumption.md) keeps
frameworks in Exact, React, SvelteKit, Nuxt order and includes raw current values, eligible
control-normalized Exact-before values with raw history in parentheses, every browser and startup
population, function and artifact inventories, Node SSR, render-only and allocation evidence,
response decomposition, equal-payload, preloaded and saturation lanes, and Bun separately. The
immutable SSR evidence is
`framework-comparison/results/raw/ssr-2026-09-02T05-11-08-579Z.json`; browser and startup captures
are under `.tmp/direct-indexed-resumption-checkpoint`.

The current browser transfers 194,340 script bytes, 34 fewer than the preceding accepted artifact.
The complete controlled-startup population executes 101,531 bytes and invokes 560 functions,
deterministic reductions of 166 bytes and two functions from that preceding checkpoint. Warm used
heap is 2,576,364 bytes at p50, compared with 2,577,544 bytes raw and normalized before. Cold used
heap is 2,431,404 bytes, compared with 2,432,584 bytes raw and 2,429,726 bytes after eligible
control normalization; the 0.07% normalized difference is below the focused paired experiment's
resolution. Evaluation is 18.448 ms p50 versus 18.587 ms normalized before. Optimistic feedback is
1.5/1.6/1.8/2.3 ms; its p50 is neutral and the isolated p99 movement is contradicted by stable lower
percentiles and moving controls.

The server artifact is byte-identical to the preceding checkpoint. Fresh Node ordinary c16 is
2,084.8 RPS p50, sustained c32 is 2,353.6 RPS, and c64 is 2,342.6 RPS. React moved from 2,135.0 to
2,228.6 RPS in ordinary c16 while the other controls moved by different ratios, making that lane
ineligible for normalization. Eligible normalized comparisons put c32 and c64 1.5% and 2.4% below
the preceding run even though no server byte changed. Those values quantify between-run machine and
process variance; they are not attributed to the client-only implementation. This is why the next
server candidate will use directly alternating before/current artifacts in addition to the four
framework controls.

### Positional root publication and resumption cursor checkpoint

The accepted implementation replaces request-local indexed-resumption consumption bitmaps and
history arrays with one ordered cursor. Scheduled server frames reserve their records only when
their output is committed, so synchronous and scheduled component records follow the same
component-tree order without speculative siblings reordering the stream. Compiler-proven finite
root props use matching immutable client/server schemas. The hydration safety traversal validates
authored descriptors and constructs the final positional cells in the same pass; open shapes,
accessors, runtime mismatches, output extensions, and unsupported values retain the named path.

The [complete grouped-percentile report](component-local-target-abi/positional-root-publication.md)
contains the 50-sample balanced browser and 1x/4x/6x startup populations, complete fresh Node SSR
and Bun diagnostics, every function and artifact counter, response decomposition, render/allocation,
payload, preloaded, equal-payload, retention, and saturation lane. It keeps framework columns in
Exact, React, SvelteKit, Nuxt order and reports eligible control-normalized Exact-before values with
raw history in parentheses. The same admitted participant builds were reused throughout. Immutable
evidence is `.tmp/positional-root-publication/checkpoint` and
`framework-comparison/results/raw/ssr-2026-09-02T07-03-49-539Z.json`.

The Exact response falls from 4,314 to 4,033 bytes, a 281-byte or 6.5% reduction. Directly
interleaved accepted/current ordinary Node c16 is neutral at 2,093.9/2,097.8 RPS p50. The five-window
saturation lanes are mixed: current exceeds the accepted artifact at c4 and c16, is effectively
neutral at c8, and trails at c1/c32/c64. The stronger focused 50-pair population is likewise neutral:
paired mean ratios are 1.001 at c16, 1.005 at c32, and 0.992 at c64, with c64 median ratio 0.999.
Three-window preloaded attribution moves down 2.6%/2.1%/0.5% at c8/c32/c64; its small population is
not used to overrule the ordinary and focused interleaved evidence. Render-only p50 is
0.0337/0.0338 ms before/current while current p75/p95/p99 are lower. Sampled allocation is 3.68 MB
versus 3.55 MB in separate profiles; the paired focused allocation experiment narrows that movement
to 1.4%, identifying the fused schema traversal as the remaining cost rather than a second render
or publication pass.

On the client, the modular root schema costs 1,305 deterministic raw/decoded bytes, 1,085 executed
bytes, two parsed and compiled functions, and one invoked function. Warm retained heap is 2,581,728
bytes versus 2,576,364 normalized before; cold used heap is 2,436,768 bytes versus 2,434,264
normalized before. Both heap movements are about 0.2% or less. Optimistic feedback remains
1.5/1.6/1.8/2.1 ms. Evaluation is 18.714 ms versus 18.347 ms normalized before. These are accepted
as a bounded client cost for eliminating 281 response bytes and the server/client record-search
structures, not claimed as a client performance improvement.

A follow-up flattened every nested schema into one prefix array. After correcting a focused-build
mistake that had paired the new compiler output with stale target-local runtime output, production
browser behavior passed. The correct flat decoder nevertheless added about 630 more client bytes
to save only a few dozen small immutable arrays, so that refinement was removed. This confirms that
future client work should reduce which schema/code is reachable for a selected root rather than
adding a general cursor parser for already-small module metadata.

### Client schema reachability and reactive ownership follow-ups

Two representations tested whether the client could retain only the selected root's positional
schema. An inert JSON source added 505 raw client bytes, two parsed/compiled/invoked functions, 509
executed bytes, and about 1.95 KiB of retained heap in balanced 50-sample populations. Replacing the
source with compiler-emitted zero-argument materializers avoided JSON parsing but retained three
closures; it added 402 transferred bytes and about 2.08 KiB of normalized retained heap. V8's small
literal arrays are cheaper in this fixture than either retained strings plus parsing or closure
backed factories. Both forms were removed. A meaningful reachability reduction would require the
bundler's root closure to omit non-root schemas, not another component-local encoding.

Heap retainers then identified 21 scope-child Sets, 20 scope-reaction Sets, and 28 eagerly allocated
computed-edge Sets. Replacing all scope ownership Sets with dense arrays did delete 48 live Sets,
but growable-array storage and two ownership helpers added two profiled/invoked functions and 96
executed bytes. Across 50 alternating profiles, retained heap rose by exactly 1,664 bytes at each
population boundary. A singleton-or-Set refinement removed the common Set tables and improved
sampled startup and interaction allocation by about 0.7% and 0.9%, but added 747 raw client bytes;
its retained bytecode outweighed the data saving and raised paired retained heap by 396 bytes. Both
scope representations were removed rather than crediting allocation moved into code topology.

Computed edges have a narrower lifecycle: most computed nodes have no computed source or sink at
all. The retained refinement allocates each Set only when its first computed-to-computed edge is
linked and releases it with the last edge. Set semantics, graph deduplication, settlement order,
cycle detection, failure recovery, observation, and disposal are unchanged. Fifty alternating
profiles keep profiled and invoked functions fixed at 1,172 and 631. Retained heap improves in 37
pairs, with a mean reduction of 1,178 bytes; paired differences cluster at -1,352 and -3,524 bytes,
with thirteen +820-byte samples. Startup allocation and CPU are neutral, and interaction CPU is
neutral-to-positive. The 4-KiB-sampled interaction allocation population is mixed: native/V8 sample
buckets increase while the Set allocation bucket falls, despite unchanged function inventory and
lower retained heap, so no interaction-allocation movement is attributed.

The balanced four-framework browser population reports 2,580,208 bytes of Exact retained heap,
1,520 bytes below the preceding accepted artifact's raw and normalized 2,581,728 bytes. Optimistic
feedback remains 1.5/1.6/1.8/1.9 ms at p50/p75/p95/p99. The client transfers 195,774 script bytes,
129 more than before; Brotli grows 41 bytes and gzip 18 bytes. The server artifact and 4,033-byte
response are unchanged. Focused evidence and written gates are under
`.tmp/inert-client-schema`, `.tmp/client-scope-arrays`, `.tmp/client-lazy-computed-edges`, and
`.tmp/client-scope-singletons`.

### Anonymous compiler-direct structural ranges

Compiler-direct structural ranges remain explicitly owned, but their marker pair no longer repeats
the compiler operation's unrelated 23-byte stable identity. The component-local operation and
ordered hydration cursor already select the range. The shared anonymous marker therefore carries
only nesting ownership, and the client closing claim counts identical nested openings by depth.
Dynamic-component, keyed, refreshable, recovery, and otherwise addressable boundaries retain their
stable identities.

The accepted diagnostic response falls from 4,033 to 3,941 bytes, a 92-byte or 2.3% reduction. The
same fixture rendered outside the diagnostic envelope falls from 4,128 to 4,036 bytes. Semantic
markup and hydration data are unchanged. The production client artifact grows 46 raw bytes for the
nesting-aware closing claim; the server artifact grows 127 raw bytes. Server bytes are recorded as a
counter-metric rather than treated as a rejection threshold.

The first 100-pair collected render population appeared about 5% slower while directly interleaved
HTTP capacity improved. The candidate was retained for diagnosis rather than rejected from that
contradiction. A second 100-pair experiment alternated both collection modes within every artifact
pair. Collected rendering then improved by 1.74% on paired means, with 66/100 wins; direct-sink
rendering was neutral at a 1.0000003 paired mean ratio, with p50 moving from 0.0289 to 0.0284 ms.
The earlier regression was therefore order/environment interference rather than repeated work in
the marker representation.

Fifty directly alternating capacity rounds improve paired mean RPS by 1.43% at c16, 1.41% at c32,
and 1.55% at c64, with 39, 37, and 39 wins. Sampled allocation improves 1.47% on paired means in a
20-pair population, although its 10/10 win split is too noisy for an independent allocation claim.
The retained conclusion is a deterministic payload reduction, neutral direct-render work, and a
consistent modest Node-capacity gain. Gates, immutable artifacts, and focused evidence are under
`.tmp/anonymous-direct-ranges`.

The [complete grouped-percentile report](component-local-target-abi/anonymous-direct-ranges.md)
contains 50 balanced browser samples, 50 samples at each 1x/4x/6x startup rate, the complete fresh
Node SSR and Bun diagnostic populations, response decomposition, allocation sites, every payload
and saturation lane, and the directly interleaved positional-root Exact-before artifact. The four
participants were built once by the browser capture and those admitted artifacts were reused by
startup and SSR. Immutable SSR evidence is
`framework-comparison/results/raw/ssr-2026-09-02T09-30-23-614Z.json`; browser and startup captures
remain under `.tmp/anonymous-direct-ranges/checkpoint`.

The complete client population retains the focused heap result: warm used heap is 2,580,240 bytes,
1,488 bytes below the eligible normalized and raw 2,581,728-byte history. Cold 1x used heap is
2,435,280 bytes, 1,488 bytes below the raw history but 1,375 bytes above its control-normalized
history. Evaluation improves from 18.714 ms raw and 19.106 ms normalized to 18.361 ms at p50.
Optimistic feedback remains 1.5/1.6/1.9/2.2 ms; its p50 is unchanged, and the upper-tail movement
is contradicted by the focused 1.5/1.6/1.8/1.9 population and moving controls. The combined lazy
computed-edge and nesting-aware claim changes add 175 raw/decoded client bytes and 132 executed
bytes while leaving the 1x invoked-function count at 561. Brotli falls 23 bytes despite the raw
growth, illustrating why raw size is a counter-metric rather than a performance verdict.

Fresh Node ordinary c16 is 2,103.3 RPS versus React at 2,158.3, a 2.5% gap. Exact leads React at
saturation c32 by 0.2% and c64 by 3.1%, while trailing by 0.7% at c16. Equal-8-KiB Exact leads at
c32 and c64 by 5.1% and 2.5%, with c8 mixed across percentiles. Directly interleaved Exact-before
preloaded p50 improves 1.8% at c32 and 3.2% at c64, confirming the focused render-path result;
ordinary lanes remain mixed because they include controlled-service work, and equal-payload lanes
intentionally remove the smaller response's transport benefit. Render-only is effectively unchanged
at 0.0340 ms p50 versus 0.0338 before and remains slower than React's 0.0232 ms. Exact retains the
lowest Node post-GC heap at 12.52 MB p50 and the lowest used-heap slope at 2,432 bytes/request,
versus React at 13.18 MB and 3,012 bytes/request.

### Allocation-free safe marker-key proof

Common keyed-list identities satisfy the marker protocol's direct ASCII grammar. The server now
proves that grammar with a character scan and calls the canonical UTF-8 encoder only for empty,
Unicode, comment-terminating, or otherwise unsafe values. Safe and fallback encodings are
byte-identical; hydration ownership, snapshot parsing, patch identity, nesting, and recovery are
unchanged. The proof caches no request or component values and adds no client code.

One hundred alternating render pairs improve collected rendering by 3.0% on paired means with 65
wins and direct-sink rendering by 1.36% with 61 wins. Direct p50/p75/p95/p99 move from
0.0303/0.0473/0.0698/0.0931 ms to 0.0297/0.0461/0.0688/0.0920 ms. The former
`encodeExactMarkerPart` site appears in baseline allocation profiles at about 48 KiB sampled per
100 renders and disappears from the candidate. Whole-render sampled allocation improves 0.63% on
paired means; its 11/20 win split remains too coarse for a stronger total-allocation claim.

Fifty directly alternating preloaded rounds improve paired mean RPS by 2.35% at c16, 1.46% at c32,
and 0.71% at c64, with 41, 36, and 30 wins. The 3,941-byte response and production client artifact
are exactly unchanged. The Node server entry grows from 238,910 to 239,653 raw bytes; that
server-only cost is accepted for deleting repeated render work. Focused evidence and the written
gate are under `.tmp/keyed-marker-encoding`.

### Compiler-prepared keyed range identity

Compiler-prepared keyed child programs no longer combine their authored key with an unrelated
request-global numeric marker id. The key already supplies the stable range identity required by
hydration, keyed replacement, and recovery, so synchronous and asynchronous prepared-program
operations now emit the same key-only item marker used by the existing server-handler path.
Generic keyed receipts retain allocated marker ids because their ownership is not proven by the
prepared-program contract. Unsafe keys continue through the canonical marker encoder, and no
request or component values are retained outside the request.

The framework-comparison fixture falls from 4,036 to 4,018 bytes, and the diagnostic response falls
from 3,941 to 3,923 bytes. The production client artifact is byte-identical. The Node server entry
grows by 114 raw bytes, from 239,653 to 239,767, as the focused operation targets reach the shared
key-only helper.

One hundred mode-interleaved render pairs improve collected rendering by 1.75% on paired means with
67 wins and direct-sink rendering by 2.22% with 69 wins. Direct p50 moves from 0.0306 to 0.0300 ms.
Sampled transient allocation improves 1.33% on paired means and 1.63% at the paired median in a
20-pair population, with 12 wins.

The first two throughput populations kept the concurrency lanes in fixed c16, c32, c64 order. They
showed neutral c16/c32 behavior after reversing worker startup order but an apparent 0.9% c64 loss.
That result conflicted with the render and allocation evidence, so it was diagnosed rather than
used to reject the representation. Because c64 was always last, it absorbed the accumulated
heat-and-queue position in every round. A 60-round follow-up rotated all three concurrency orders
evenly while continuing to alternate artifact order. Paired mean RPS then improves 1.03% at c16,
0.46% at c32, and 0.11% at c64, with 45, 31, and 36 wins. The fixed-lane result is retained as
benchmark-method evidence: concurrency order must be balanced when sub-percent changes matter.

Focused SSR, DOM hydration, and composition-corpus suites pass with 205, 266, and 51 tests.
Expected metrics and immutable focused evidence are under `.tmp/keyed-program-marker-identity`.

### Direct positional resumption cursor

The document protocol already publishes compiler-indexed resumption tuples in component-tree order.
The client previously validated those tuples, eagerly projected every tuple into a keyed activation
object, copied the resulting list, and then advanced a rollback-capable component cursor over those
objects. The retained implementation keeps validated document resumptions as tuples. The receiving
component's contract resolves numeric state and context fields in place when the existing cursor
claims the record. Explicit application registrations remain named objects, and component order,
contract authorization, duplicate rejection, settled tasks, contexts, checkpoints, rollback,
replacement, and recovery retain the same behavior.

The production client artifact grows by 100 raw bytes, from 195,520 to 195,620, while the server
artifact remains byte-identical at 239,767 bytes and the 3,923-byte response is unchanged. In 50
balanced browser pairs, profiled functions fall from 1,172 to 1,170, invoked functions fall from 631
to 629, and precise executed code falls from 82,661 to 82,651 bytes. Retained heap moves from
1,900,612 to 1,900,184 bytes at p50 and by the same 428 bytes at every population boundary; 34/50
paired samples favor the tuple cursor. Startup allocation improves 1.19% on paired means with 27
wins. Startup CPU is neutral-to-positive at a 0.994 paired mean ratio and 27 wins.

The broad interaction CPU population initially contradicted the startup-only mechanism: its paired
mean moved 3.15% upward with 20 wins, while interaction allocation had a neutral median but a 7.6%
outlier-driven mean. Site attribution found no cursor or resumption work after startup; native and
general JavaScript samples moved together, allocation direction reversed between run halves and
artifact orders, and a 10%-trimmed interaction CPU population narrowed to 2.07%. Two independent
100-pair optimistic-feedback populations then pointed in opposite directions. Combined, current
p50 is one 0.1 ms timer bucket lower, p75/p95 are identical, paired median is exactly 1.0, and paired
mean is 1.008. Interaction is therefore recorded as neutral within host and timer resolution, not as
an attributed gain or regression.

Core, hydration, DOM, and SSR suites pass with 231, 217, 266, and 205 tests. Focused evidence and
the written gate are under `.tmp/direct-resumption-cursor-tuples`.

### Direct positional hydration envelope

The compiler-direct document path now publishes its optional framework metadata as a versioned
presence-mask tuple. Values occur once in canonical field order, while authored state, props,
contexts, endpoint tables, and other nested containers retain descriptor-safe validation and their
existing representations. Unknown bits, missing values, and trailing values fail closed. The
hydration-only entry additionally rejects fields owned by the complete runtime. Output extensions
retain the keyed generic envelope.

Two misleading results were resolved before judging the representation. First, pairing the new
server protocol with the accepted old client necessarily failed hydration; browser comparisons use
protocol-matched artifacts. Second, an exploratory five-field root-prop schema matched a raw fixture
but not the normative three-field SSR service input. That mismatch forced the named fallback,
increased the real response from 3,923 to 4,204 bytes, and reduced concurrency by about 4%; the
schema change was removed. The accepted envelope changes the normative response from 3,923 to
3,900 bytes and its hydration payload from 518 to 495 bytes.

An initial shared decoder projected the tuple into a keyed intermediate object. It added 579 raw
client bytes, one profiled and invoked function, and 281 executed bytes, so that mechanism was
removed. The retained decoders consume the tuple directly in the existing full-runtime and
hydration-only parsers. Relative to the positional-cursor artifact, the production client grows 290
raw bytes while profiled functions fall from 1,170 to 1,169, invoked functions fall from 629 to 627,
and executed code falls from 82,651 to 82,409 bytes. Both retained-heap population boundaries fall
by exactly 76 bytes. The apparent p50 increase from 1,900,184 to 1,902,280 bytes is solely a
population-boundary crossing between the same two clusters, not retained growth. Non-interleaved
startup and interaction timing samples are retained as diagnostics and receive no attribution.

One hundred mode-interleaved server pairs improve collected rendering by 1.44% on paired means with
64 wins and direct-sink rendering by 4.57% with 84 wins. Direct p50/p75/p95/p99 move from
0.0307/0.0477/0.0700/0.0924 ms to 0.0291/0.0454/0.0671/0.0895 ms. Sampled transient allocation is
neutral in 20 pairs: the paired mean ratio is 1.0006, the median ratio is 0.9950, and 11 pairs favor
the candidate.

Sixty preloaded rounds rotate all c16/c32/c64 lane orders evenly and alternate artifact order.
Paired mean RPS improves 1.06% at c16 and 0.84% at c32, with 37 and 38 wins. The c64 paired mean is
0.21% lower with an effectively neutral 0.999 median ratio and a 30/30 split. The Node server entry
grows 1,849 raw bytes, from 239,767 to 241,616; this server-only reachability cost is accepted for
the smaller response and reduced executed render work. Focused evidence is under
`.tmp/direct-hydration-envelope-tuple`.

### Completed positional hydration publication checkpoint

The complete production checkpoint confirms the focused positional-envelope result. Relative to
the anonymous-direct-range checkpoint, Exact's response falls from 3,941 to 3,900 bytes and its
hydration payload falls from 518 to 495 bytes. Relative to the immediately preceding keyed-range
response, the envelope itself accounts for 23 bytes of that reduction. The accepted server entry is
241,616 raw bytes and the complete three-file Node artifact is 242,096 bytes. The production client
artifact is 200,413 raw bytes, 390 bytes above the earlier complete checkpoint; decoded script grows
by the same amount and executed code grows 437 bytes. Countervailing topology improvements reduce
parsed functions from 762 to 758, compiled functions from 777 to 773, and invoked functions from
561 to 559.

The 50-sample browser population reports 2,579,376 bytes of warm Exact heap at p50, 864 bytes below
eligible normalized and raw history. Optimistic feedback is 1.5/1.6/2.0/2.2 ms and remains neutral
within the fixture's 0.1 ms timer buckets. Startup evaluation is likewise neutral: 1x p50 is 18.377
ms versus 18.361 ms raw and 18.301 ms control-normalized history. The representation therefore
earns its client cost through a smaller protocol and fewer reachable functions rather than a claimed
timing improvement.

Node render-only p50 improves from 0.0340 to 0.0323 ms. Sampled transient allocation falls from
3,365,728 to 3,296,632 bytes per 100 renders, while React samples 6,910,920 bytes. Directly
interleaved current-versus-Exact-before p50 RPS improves in every ordinary, preloaded, and
equal-payload lane: ordinary c16 is +27.3%; saturation c32 and c64 are +4.7% and +4.0%; preloaded c32
and c64 are +2.0% and +1.9%; and equal-8-KiB c32 and c64 are +1.4% and +2.3%. These same-run results
are the causal comparison for the artifact change. The separate-run control-normalized ordinary
c16 history moves in the opposite direction because the checkpoint also changes worker-startup
topology and removes the old fixed process-position bias; both views remain in the report rather
than selecting the favorable one.

Against current React on Node, Exact ordinary c16 remains 5.2% behind at p50. Exact leads at
saturation c4, c8, and c16 by 0.7%, 2.1%, and 0.7%, then trails at c32 and c64 by 1.1% and 3.2%.
Equal-8-KiB c32 and c64 trail by 3.9% and 3.8%. The renderer-isolated gap is larger: preloaded c32
and c64 trail by about 16%, and render-only p50 remains about 40% slower. Exact nevertheless retains
the lowest Node post-GC heap at 12.53 MB and samples 52% fewer render-only allocation bytes than
React. The 3,195-byte/request used-heap slope is worse than both the 2,432-byte historical Exact
population and React's 3,038 bytes/request; because absolute post-GC heap remains lowest and the
slope uses only five bounded checkpoints, it is retained as a counter-signal requiring another
focused population rather than described as a leak or dismissed as noise.

The first complete Bun attempt exposed a benchmark defect instead of a renderer defect. Bun 1.3.5
on Windows reuses 64 connections per origin. The controlled fixture performs two parallel fetches
per SSR request, so c64 creates 128 simultaneous upstream fetches. A direct threshold probe opened
64 sockets and reused them at c32, but opened 1,344 sockets over 20 rounds at c64: 64 reusable
sockets plus 64 one-shot sockets per round. The long population exhausted Windows' 16,384-port
ephemeral range and caused unrelated participants to return data-load failures. Bounding Bun
workers with `BUN_CONFIG_MAX_HTTP_REQUESTS=64` queues the excess work while preserving the same
two-endpoint fixture. The complete three-renderer lifecycle then used 672 service connections
instead of 26,708 and finished without failure. The effective worker environment is recorded in
raw evidence and explicit operator configuration remains authoritative.

The corrected Bun diagnostic has Exact and React effectively tied in ordinary concurrent p50 at
3,093 and 3,112 RPS. It remains a diagnostic rather than the cross-framework decision lane because
Exact uses native `Bun.serve` while the other participants use Bun's `node:http` compatibility path.
Its historical column is therefore raw-only and marked `environment-changed`.

The [complete grouped-percentile report](component-local-target-abi/positional-hydration-publication.md)
contains all 49 browser, startup, function-inventory, artifact, Node SSR, allocation, response,
equal-payload, preloaded, saturation, retention, and Bun diagnostic suites. Immutable raw evidence
is retained under `.tmp/final-positional-envelope-checkpoint`; Node and Bun source files remain
separate, and the composed report input records their independent measurement rounds and runtime
environments.

### Compact anonymous synchronous compiler-direct ranges

Synchronous compiler-direct structural ranges already omitted their stable operation identity and
were selected by the component-local operation at the current adoption position. Their comments
nevertheless retained the long `exact:dynamic:` prefix. The retained implementation preserves the
same explicit opening/closing ownership and nesting algorithm while serializing these
non-addressable ranges as `<!--x-->` and `<!--/x-->`. Stable dynamic-component, keyed,
recovery-addressable, fragment, target, activity, suspense, unsafe-HTML, compatibility, and
asynchronous boundaries are unchanged.

The comparison response falls from 3,900 to 3,848 bytes. Dynamic marker comments fall from 422 to
370 bytes; semantic markup remains 2,392 bytes, the hydration payload remains 495 bytes, identity
attributes remain 160 bytes, and the DOM comment count is unchanged. The production client script
is byte-identical at 195,922 bytes and the complete client artifact remains 200,413 bytes. The
retained Node server entry grows by 29 raw bytes, from 241,616 to 241,645 bytes; the complete
three-file artifact likewise grows from 242,096 to 242,125 bytes.

The first implementation introduced a shared marker-pair helper and separate range-content methods
in both synchronous and asynchronous operation targets. Although its focused preloaded population
was neutral-to-positive, its complete Node run reduced directly interleaved preloaded paired mean
RPS by about 7-8%. The mechanism also grew the Node entry by 388 bytes. That contradiction was
investigated rather than accepted: the fixture never uses the changed asynchronous path, and the
extra helper/method topology was the only material work beyond choosing shorter literals. The
generalized mechanism was removed.

The retained implementation leaves the asynchronous target untouched and keeps the existing
synchronous render closure topology. An empty internal identity selects the two compact literals in
the existing marker operation. Twenty alternating focused pairs put collected render work at a
0.951 paired median ratio and 1.029 mean ratio, with 14 wins; the outlier-sensitive timing result is
treated as neutral. Sampled allocation improves at a 0.967 paired median ratio and 0.977 paired mean
ratio, also with 14 wins. Fifty balanced preloaded rounds produce paired mean RPS ratios of 1.005 at
c16, 1.001 at c32, and 1.004 at c64, with 26, 24, and 24 wins.

The complete 50-round Node matrix confirms that the broad regression is gone. Sustained saturation
paired means range from 0.992 to 1.014 across c1-c64, with every lane split between 23 and 26 wins.
Preloaded paired means improve 1.7% at c8, 3.2% at c32, and 0.7% at c64. The ordinary c16 p50 falls
from 1,812 to 1,758 RPS, but its paired mean is only 0.6% lower and its individual ratios range from
0.48 to 2.18; the longer sustained lanes do not reproduce that movement. It is retained as a noisy
counter-signal rather than discarded or attributed to the two literal changes. The separate Bun
diagnostic is likewise neutral overall and improves preloaded paired means 0.8% at c8 and 1.5% at
c32 while reducing c64 by 0.9%.

The specialization is accepted for its deterministic 52-byte response reduction, unchanged client
artifact, lower sampled allocation, and neutral sustained Node capacity. The
[complete grouped-percentile report](component-local-target-abi/compact-anonymous-ranges.md) includes
the browser, startup, function-inventory, artifact, Node SSR, allocation, response, equal-payload,
preloaded, saturation, retention, and separate Bun diagnostic tables. Focused and complete raw
evidence is under `.tmp/compact-anonymous-ranges`; the rejected generalized result remains beside
the refined result so the implementation-shape finding is reproducible.

### Compact keyed item ranges

Compiler-prepared keyed ranges already use the canonically encoded authored key as their stable
identity. Their opening and closing comments nevertheless repeated the `exact:item:` namespace and
kind. The retained protocol serializes those ranges as `<!--i:key-->` and `<!--/i:key-->`. Keyed
scope ownership, replacement identity, nesting, snapshot parsing, server diff publication,
hydration recovery, and unsafe-key encoding remain unchanged. Non-item marker grammars are
unchanged, and the client does not retain a transitional item grammar.

The comparison response falls from 3,848 to 3,794 bytes. Keyed item comments fall from 153 to 99
bytes; semantic markup remains 2,392 bytes, hydration payload remains 495 bytes, identity attributes
remain 160 bytes, and the DOM comment count is unchanged. The production client script is
195,913 bytes, 9 bytes smaller because keyed adoption consumes the shorter grammar; the complete
client artifact is 200,416 bytes, 3 bytes larger after its surrounding artifact files are included.
The retained Node server entry is 241,800 bytes, 155 bytes above the immediately preceding entry.

Two apparently simpler writer shapes were measured and removed. Adding an explicit fourth
`compactItem` argument changed the hot generic writer ABI and made direct rendering 3.4% slower over
100 alternating pairs, with both artifact positions worse. A separate Promise-capable keyed writer
split three row calls away from the already-hot generic writer, grew the server entry to 242,352
bytes, and made direct rendering 10.5% slower over 100 pairs, again in both positions. The retained
single-writer implementation recognizes the internal `item:` marker identity and changes only the
serialized literals.

One hundred mode-interleaved pairs put collected render work at a 0.975 paired mean ratio with 69
wins and direct rendering at a 0.972 paired mean ratio with 61 wins. Candidate-first and
candidate-second direct ratios are both 0.973, excluding process position as the explanation.
Twenty alternating allocation profiles are neutral at a 0.998 paired mean ratio with 9 wins.

The first 50-round throughput population reversed lane order but did not rotate every lane through
every position. It reported paired means of 0.993 at c16, 1.002 at c32, and 0.991 at c64. Because
that conflicted with the larger render population, a 60-round follow-up cycled all three lane orders
while alternating artifact order. Paired mean RPS then improves 0.87% at c16, 0.17% at c32, and
2.76% at c64, with 31, 30, and 36 wins. The compact keyed grammar is retained for its deterministic
54-byte response reduction, smaller decoded and executed client code, improved direct render work,
and neutral-to-positive balanced capacity.

The complete 50-sample checkpoint initially appeared to contradict the focused result: the
five-participant fixed-wave c16 population put current Exact about 4% below the same-run prior Exact
artifact. Its pair decomposition identified a measurement-order defect. When current preceded the
prior artifact, the geometric paired ratio was 0.997; when the prior artifact preceded current,
three unrelated framework lanes ran between them and the ratio was 0.894. The rotating order
balanced absolute positions but not the distance between the two Exact artifacts, assigning
within-round workstation drift to current in half the rounds. A separate 100-pair HTTP population
ran the artifacts adjacently and reversed their order every round. Fixed-wave c16 then improved
2.64% by geometric mean and 1.63% at the paired median; sustained c16 improved 1.18% and 2.31%, with
the sustained result positive in both orders. The unfavorable five-lane result remains in the full
report rather than being erased.

The complete counter-metrics are consistent with a server protocol improvement rather than shifted
work. Sampled Node render allocation falls from 3,448,216 to 3,341,920 bytes per 100 profiled
renders. Post-GC Node heap is 12,534,888 bytes versus 12,558,087 control-normalized history. The
separate non-interleaved render-only p50 moves from 0.0357 to 0.0386 ms, contradicting the 100-pair
direct-render improvement; its topology cannot normalize with two renderer-owning controls and the
allocation plus adjacent HTTP populations do not reproduce a regression. Against current React,
Exact is 0.4% behind at sustained c32 and 0.8% ahead at c64. At equal 8 KiB it leads by 0.1% at c32
and trails by 1.0% at c64. Preloaded rendering trails by 5.3% at c32 but leads by 3.1% at c64.

Client retained heap is effectively unchanged at 2,579,500 bytes versus 2,579,409 normalized
history, and invoked functions remain 560. Startup 1x evaluation improves from 21.261 ms normalized
history to 20.648 ms, while optimistic feedback remains in the same 1.6 ms timer bucket as raw
history. No client performance gain beyond the deterministic 9-byte parser reduction is attributed
to the server marker change.

The [complete grouped-percentile report](component-local-target-abi/compact-keyed-ranges.md) includes
all browser, startup, function-inventory, artifact, Node SSR, allocation, response decomposition,
equal-payload, preloaded, saturation, retention, same-run Exact-before, adjacent paired verification,
and separate Bun diagnostic tables. Written gates and immutable raw evidence are under
`.tmp/compact-keyed-range-markers`.

### Client dependency storage and keyed property operands

Three focused client allocation sites were evaluated against the compact-keyed-range checkpoint.
Fixed subscriptions first retained their selected dependency set twice: once when constructing the
reaction and again while linking it. Removing the duplicate initial copy reduces executed code by
4 bytes and retained heap by about 2.4 KiB at p50 in 50 alternating profiles. Function inventory is
unchanged, startup allocation is neutral at a 1.001 paired mean ratio, and interaction timing is
mixed within the fixture's timer resolution. The change is retained because it deletes redundant
ownership and makes cleanup visit each dependency exactly once.

Compiler-keyed list registration also eagerly built canonical keyed metadata even though the
comparison's client list never requests structured replacement or protocol serialization metadata.
Metadata construction is now lazy at the existing reconciliation/serialization request sites.
Against the dependency-storage artifact, 50 alternating profiles reduce retained heap from
1,900,072 to 1,855,408 bytes in every pair, precise executed code from 82,397 to 79,695 bytes,
profiled functions from 1,170 to 1,165, and invoked functions from 628 to 610. Paired startup CPU
improves 4.1% and interaction CPU improves 7.5% by mean. Three independently alternating
100-pair timing populations leave optimistic feedback and settlement neutral; the initially
unfavorable settlement population reverses in the third run. The production client falls 8 raw
bytes, and required metadata remains constructed before its first actual consumer.

The remaining keyed-row child prop initially used `createExpression(() => incident.severity)`,
allocating one full computed owner and reader closure per retained row. A first direct-property
helper saved 8,944 retained bytes but added one profiled and invoked function and 123 executed bytes;
that mechanism was removed. The retained compiler form instead emits a marked three-field operand
tuple. The receiving indexed prop store resolves the value, while the existing focused component
dependency binder subscribes through the operand's exact indexed or ordinary target/key identity.
There is no runtime operand cache, bound function, general interpreter, or change to arbitrary
expression ownership.

Relative to the lazy-metadata artifact, 50 alternating profiles reduce retained heap from
1,855,408 to 1,841,524 bytes in every pair, profiled functions from 1,165 to 1,164, and invoked
functions from 610 to 609. Startup CPU is neutral at a 1.002 paired mean ratio; interaction CPU is
also neutral-to-positive at 0.993. The client artifact and precise executed code grow by 202 bytes.
Sampled startup allocation moves upward 1.3% by paired mean with only 22 wins, while deterministic
post-GC retention falls 13,884 bytes. This is recorded as the cost of the additional focused tuple
branches rather than claimed as an allocation win. Across 300 alternating interaction pairs,
optimistic feedback remains 1.9 ms at p50 with a -0.002 ms paired mean, and settlement remains
13.6 ms at p50 with a +0.066 ms paired mean and nearly even wins. The change is retained for the
deterministic heap and function-topology improvements; it does not claim a timing win.

The composition corpus now protects direct mutation, same-key replacement, movement, matching
hydration, and arbitrary-expression fallback. Focused evidence is under
`.tmp/client-subscription-duplicate-deps`, `.tmp/client-lazy-keyed-metadata`,
`.tmp/client-property-operands`, and `.tmp/client-property-operand-tuples`.

The combined slice passed `npm run performance:check` on September 2, 2026. That command's internal
framework benchmark is an acceptance gate, not the four-framework comparison suite, so its timings
are not substituted for an interleaved Exact, React, SvelteKit, and Nuxt checkpoint.

### Keyed property operand complete comparison checkpoint

The committed artifact was subsequently measured with 50 balanced, round-interleaved samples in
the browser and at each 1x, 4x, and 6x startup CPU rate, followed by the complete 50-sample Node SSR
and separate Bun diagnostic suites. All 28 shared browser correctness scenarios passed before the
admitted builds were reused. The
[complete grouped-percentile report](component-local-target-abi/keyed-property-operands.md) includes
every browser, startup, function-inventory, artifact, Node SSR, allocation, response-decomposition,
equal-payload, preloaded, service-phase, retention, saturation, and Bun table. Raw evidence and the
control-normalization results are under `.tmp/keyed-property-operands-checkpoint`.

Against the preceding accepted checkpoint, the full client population reduces warm used heap from
2,579,500 to 2,526,348 bytes at p50 and cold used heap from 2,434,540 to 2,385,268 bytes. Precise
executed code falls from 103,184 to 100,279 bytes, invoked functions fall from 560 to 543, and
profiled functions fall from 1,151 to 1,146. Evaluation is effectively neutral at 20.75 ms versus
20.90 ms control-normalized before. The p50 and p75 optimistic-feedback values remain 1.6 and 1.8
ms, while p95 and p99 move from 2.4 and 3.5 ms raw before to 3.1 and 4.3 ms; the upper-tail movement
is retained as a counter-metric because the full population does not reproduce the focused timing
neutrality there. The admitted client transfer grows by 555 bytes to 196,768 bytes. This exceeds the
focused candidate's 190-byte prediction; the extracted indexed-layout module is the remaining
deterministic size difference to investigate rather than attributing it to timing noise.

The server artifact and its 3,794-byte response are unchanged by this client-only implementation.
Fresh ordinary Node c16 throughput is 3,031 RPS at p50 versus React at 3,185 RPS. Saturation p50 is
within 3.4% of React from c1 through c32, and Exact leads React by 2.2% at c64. Preloaded c32 and c64
remain 10.0% and 8.4% behind React, while render-only p50 remains 0.0362 versus 0.0259 ms. Exact has
the lowest post-GC used heap at 12.54 MB, followed by React at 13.17 MB, SvelteKit at 14.18 MB, and
Nuxt at 18.02 MB. Cross-run server controls moved too differently for ordinary c16 normalization;
eligible saturation comparisons are mixed even though the server bytes are identical, so none of
that movement is attributed to the client change.

### Nested prop property operands and retained computation ownership

Heap snapshots of the comparison application exposed a replacement-lifetime leak that the ordinary
single-state retained-heap point could not show. The mounted detail component's indexed
`incident` prop retained every obsolete computed owner created for the direct
`props.incident.severity` child-prop read. The population contained 8 computed nodes after hydration,
107 after 100 selection replacements, and 1,007 after 1,000 replacements, while component, scope,
DOM-node, and listener counts remained flat. The retained path was the current indexed prop source,
through its computed sinks, to each obsolete forwarded expression.

The compiler now extends the existing focused property operand to a direct property of an
object-valued indexed prop. The immutable operand remains part of the module artifact; the receiving
component's existing indexed prop store resolves the receiver and owns dependency rebinding. The
specialization requires every distributed receiver type to be an object and preserves executable
expression ownership for primitive, nullable, unknown, derived, and arbitrary expressions. It does
not add a runtime cache, bound function, general interpreter, server lowering, or per-instance
descriptor array.

After the change, the same 100- and 1,000-replacement profiles remain at 6 computed nodes. Repeated
history and filtering interactions also keep the framework object populations flat, and navigating
to `about:blank` releases the component graph and listeners. The remaining used-heap growth between
100 and 1,000 replacements occurs with flat framework object counts and is attributed to V8 code
and instruction warmup rather than retained component state.

The production comparison artifact falls by 47 raw bytes, 16 gzip bytes, and 29 Brotli bytes. At 1x
startup, decoded code falls from 196,468 to 196,421 bytes, executed code from 100,279 to 100,229
bytes, and parsed, compiled, profiled, and invoked function populations each fall by two. Warm used
heap falls from 2,526,348 to 2,520,520 bytes; the 1x cold used-heap point falls by the same 5,828
bytes to 2,379,440 bytes. Evaluation p50 is 17.533 ms versus 18.009 ms control-normalized history;
the upper percentiles are mixed under control dispersion, so only the deterministic topology and
retention changes are attributed to the compiler specialization. Optimistic feedback is 1.6 / 1.7 /
1.8 / 2.3 ms versus 1.566 / 1.700 / 2.142 / 4.3 ms normalized before; the p50 remains in the same
timer bucket while the current upper tail is favorable.

A broader direct-top-level-prop experiment was removed after the release gate reproduced a Sudoku
sibling-update failure: it introduced a second subscription path for the same parent prop slot and
changed scheduling so the structural menu updated while its sibling `aria-expanded` binding did not.
The narrow nested-property operand does not duplicate that ownership and passes the complete Sudoku
and composition suites. The composition corpus now records 53 compiler paths, 11 scenarios, and 53
normative tests, including client replacement, matching hydration, post-adoption replacement, and
arbitrary-expression fallback.

`npm run performance:check` passed after the full release prerequisite. The accepted comparison then
used 50 balanced round-interleaved browser samples, 50 samples at each 1x, 4x, and 6x startup rate,
and 50 Node and Bun SSR windows. The server artifacts and Exact's 3,794-byte response are unchanged.
Fresh Node ordinary concurrent p50 is 2,134 RPS for Exact versus 2,113 for React; saturation remains
within 2.1% of React from c1 through c64, while preloaded c32 remains 9.1% behind. Cross-run controls
move beyond the normalization dispersion limit in several server lanes, and the sampled render-only
allocation point moves from 3.303 to 3.330 MB while React moves from 7.006 to 6.985 MB. Because this
client-only change emits identical server code, those server movements are retained as environmental
counter-metrics and are not attributed to the candidate.

The [complete grouped-percentile report](component-local-target-abi/nested-property-operands.md)
contains every browser, startup, function-inventory, artifact, Node SSR, allocation,
response-decomposition, equal-payload, preloaded, service-phase, retention, saturation, and separate
Bun diagnostic table. Raw evidence and normalization output are preserved under
`.tmp/nested-property-operands-checkpoint`; focused heap evidence and the written expected metrics are
under `.tmp/client-heap-analysis`.

### Shared reactive proxy traps

Heap dominator analysis after nested property operands showed that the remaining comparison gap was
primarily V8 code and repeated proxy trap closures rather than an uncollected component graph. Each
indexed state or prop facade created four equivalent closures, and each nested reactive proxy
created six. The runtime now gives each proxy its required instance-owned record while sharing the
trap methods through module-local prototypes. Nested records remain alias-specific because the same
raw object can simultaneously participate in different parent paths and reactive policies; no
target-only cache or module-retained component value was introduced.

Focused heap snapshots reduce used heap by 6,836 bytes after hydration, 9,788 bytes after 1,000
component replacements, and 8,204 bytes after filtering 500 keyed rows. The complete 50-round
comparison reduces warm used heap from 2,520,520 to 2,513,624 bytes and 1x cold used heap from
2,379,440 to 2,372,700 bytes. Profiled and invoked functions remain 1,144 and 541. The client cost is
434 raw, transferred, and decoded bytes, 116 gzip bytes, 86 Brotli bytes, and 352 executed bytes.
Optimistic feedback is flat at p50 / p75 and modestly favorable at p95 / p99. Startup evaluation
changes direction across percentiles and CPU rates, so no timing improvement or regression is
attributed to the closure-retention change.

The full SSR population initially appeared unfavorable: ordinary concurrent throughput was lower
than control-normalized history toward the tail, and render-only p75 / p95 increased. Artifact
isolation showed that nested proxy sharing is absent from the server bundle while indexed handler
sharing adds 167 raw bytes. A simultaneous-worker follow-up alternated the baseline and current
artifacts for 50 render pairs and 50 throughput rounds. Render-batch medians were 0.0352 and 0.0350
ms; geometric-mean current / before RPS ratios were 1.0016 at c16, 0.9978 at c32, and 1.0032 at c64.
The full-run tail did not reproduce under adjacent pairing and is retained as environmental
counter-evidence, not attributed to the implementation.

`npm run performance:check` passed after its full release prerequisite. The
[complete grouped-percentile report](component-local-target-abi/shared-reactive-proxy-traps.md)
contains every browser, startup, function-inventory, artifact, Node SSR, allocation,
response-decomposition, equal-payload, preloaded, service-phase, retention, saturation, and Bun
diagnostic table. Raw evidence and normalization output are preserved under
`.tmp/shared-reactive-proxy-traps-checkpoint`; focused heap and simultaneous-worker evidence are
under `.tmp/client-heap-analysis` and `.tmp/reactive-proxy-server-isolation`.

### Mixed statement-bodied render-program reader dispatch

The compiler previously combined expression-bodied render-program readers into one component-local
slot dispatcher, but one statement-bodied reader forced the complete program back to a sparse array
of individual functions. The comparison queue hit that fallback because its filtered keyed-row
reader owns compiler-derived local statements. Mixed programs now use one statement-bodied
dispatcher: expression branches return directly and block branches retain their original statement
body. Arbitrary expressions remain functions, derived expressions retain computation ownership, and
the selected focused render operation remains the only consumer.

The complete 50-round comparison reduces profiled and invoked functions from 1,144 and 541 to 1,140
and 537. Warm and 1x cold used heap both fall by 1,140 bytes, to 2,512,484 and 2,371,560 bytes.
Fresh focused captures reproduce a 1,140-byte hydration reduction and a 1,432-byte reduction after
1,000 component replacements; the 500-row filtering point is flat within 208 bytes. The client cost
is 35 raw, transferred, decoded, and executed bytes, 17 gzip bytes, and 59 Brotli bytes.

Timing does not support a general speed claim. Control-normalized startup evaluation changes
direction across rates and percentiles, while 50 alternating CPU profiles are neutral at a -0.23%
paired mean. Browser optimistic feedback remains 1.6 / 1.7 ms at p50 / p75 but has an unfavorable
full-run p95. A separate 100-pair alternating population narrows that tail to 2.0 versus 1.9 ms and
shows a strong order split, so the full tail remains a counter-metric rather than being attributed to
one dispatcher branch.

The Node and Bun server artifacts and Exact's 3,794-byte response are unchanged. Node ordinary
concurrent p50 is 2,131 requests/second for Exact versus 2,192 for React. Exact is 2.2% below
control-normalized history at p50 and within 0.3% at p75. Preloaded raw p50 moves -1.2%, +1.1%, and
+4.5% at c8/c32/c64 while the sole React control moves +0.1%, +0.2%, and +3.7%; formal
normalization is not available for that two-participant diagnostic. Larger service-phase and Bun
movements track React and are environmental because the server bytes are identical.

`npm run performance:check` passed after the full release prerequisite. The
[complete grouped-percentile report](component-local-target-abi/mixed-reader-dispatch.md) contains
every browser, startup, function-inventory, artifact, Node SSR, allocation,
response-decomposition, equal-payload, preloaded, service-phase, retention, saturation, and separate
Bun diagnostic table. Raw evidence and normalization output are preserved under
`.tmp/mixed-reader-dispatch-checkpoint`; focused heap, 100-pair timing, and alternating CPU evidence
are under `.tmp/client-heap-analysis`, `.tmp/property-operands-combined`, and
`.tmp/mixed-reader-dispatch`.

### Direct compiler-slot-indexed child range storage

Hydration adoption previously appended structural and component range records to a compact array.
Binding preparation then searched that array with `find` and rediscovered an already-claimed closing
marker. The DOM runtime now stores each range record directly at its compiler slot index and reuses
its adoption-owned parent and closing boundary. Sparse non-structural slots are skipped when the
runtime rebuilds the flattened mounted-child view; range ownership and component receipt behavior
are unchanged.

The complete 50-round comparison reduces warm and 1x cold used heap by 684 bytes, to 2,511,800 and
2,370,876 bytes. A dedicated 100-sample alternating A/B reproduces a 784-byte post-hydration
reduction in both orders. Parsed and compiled functions fall from 735 and 750 to 733 and 748 at 1x,
and profiled functions fall from 1,140 to 1,138; invoked functions remain 537. The client cost is 19
raw, transferred, decoded, and profiled bytes, 5 gzip bytes, and 45 executed bytes, while Brotli
falls by 61 bytes. Startup evaluation is mixed and the alternating paired mean is neutral. The full
optimistic-feedback population fails the control-dispersion gate; a separate alternating interaction
A/B favors the candidate by 0.064 ms on mean but does not justify a timing claim.

The Node and Bun server artifacts and Exact's 3,794-byte response are unchanged. Node ordinary
concurrent p50 is 2,047 requests/second for Exact versus 2,254 for React, 1.88% below normalized
history. Saturation moves in both directions, including +5.14% at c8 and +2.58% at c32, while
equal-payload runs move much more sharply. Those unchanged-artifact server movements are retained as
environmental counter-evidence rather than attributed to this client-only slice.

`npm run performance:check` passed after its full release prerequisite. The
[complete grouped-percentile report](component-local-target-abi/direct-child-slot-storage.md)
contains every browser, startup, function-inventory, artifact, Node SSR, allocation,
response-decomposition, equal-payload, preloaded, service-phase, retention, saturation, and separate
Bun diagnostic table. Raw evidence and normalization output are preserved under
`.tmp/direct-child-slots`; focused heap, lifecycle, interaction, and alternating CPU evidence are in
the same directory and `.tmp/client-heap-analysis`.

### Single-peek indexed writes

The compiler's indexed assignment hook previously performed a preliminary state-slot peek before
calling the commit helper. Because JavaScript evaluates call arguments before entering the hook,
that peek could not provide pre-right-hand-side validation or ordering. The commit already reads for
comparison, and indexed storage reads for mutation bookkeeping; deleting the preliminary peek
reduces the complete write from three stored-slot reads to two without changing dependency identity,
dirty-operation routing, or the reactive write transaction.

The complete comparison reduces 1x startup used heap from 2,370,876 to 2,370,016 bytes, an exact
860-byte reduction across all percentiles. Decoded and executed client code each fall by 8 bytes;
gzip falls by 2 bytes while Brotli grows by 76 bytes. Parsed, compiled, profiled, and invoked
function counts are unchanged. The ordinary post-interaction heap point falls only 16 bytes, but two
100-pair focused populations reproduce the 860-byte startup reduction in both orders. Fifty rounds
of 1,000 filter updates improve the paired mean by 0.72 ms, with both execution orders favorable.
Single optimistic-feedback measurements reverse direction between repeats, and the full comparison
fails control dispersion, so no general timing claim is attached to the change.

The current and directly interleaved Exact-before Node server entries are byte-identical and have
the same SHA-256 hash. Their ordinary concurrent p50 differs by -1.32%, and their saturation p50
differences range from -2.14% to +1.02%, directly quantifying environmental movement rather than a
server regression. Current ordinary Node c16 p50 is 2,111 requests/second for Exact versus 2,138 for
React. Exact's 3,794-byte response and server implementation are unchanged.

`npm run performance:check` passed after its full release prerequisite, followed by all 28 shared
browser correctness scenarios and 50 balanced round-interleaved browser, startup, Node SSR, and Bun
diagnostic populations. The
[complete grouped-percentile report](component-local-target-abi/single-peek-indexed-writes.md)
contains every required framework table. Raw evidence and normalization output are under
`.tmp/indexed-write-single-peek`.

### Computed owner/source fusion

Each `computed()` value previously allocated a `ComputedNode`, a separate reactive-source object,
and a source-reader closure even though the node already owned the same dependency target, key, and
read operation. The node now implements the internal reactive-reference contract directly. The
public value keeps its bound `get` callback for extracted callback-style reads, while the ordinary
conversion methods share module-level functions. Dependency identity, readonly writes, observation
hooks, inspection, and computation ownership are unchanged.

The focused work deliberately separated three candidates. Sharing four individually named
conversion functions removed 280 retained bytes but added 89 raw client bytes. Consolidating the
semantically identical conversions improved that to a 656-byte reduction with negligible code
growth. Fusing the source object into its owner produced the useful result: every one of 50
alternating 1,000-sample pairs measured exactly 1,184 fewer retained bytes, independent of execution
order. The update and optimistic-feedback timings split by order and are therefore neutral rather
than accepted as speed improvements.

The complete 50-round comparison reproduces the 1,184-byte reduction in both the warm browser heap
and 1x startup heap, to 2,510,600 and 2,368,832 bytes. The client artifact falls by 46 raw bytes, 17
gzip bytes, and 115 Brotli bytes; decoded and executed code fall by 46 and 60 bytes, and profiled
functions fall from 1,138 to 1,136. Parsed, compiled, and invoked functions remain 733, 748, and 537.
Startup evaluation is effectively flat at 17.748 ms versus a control-normalized 17.726 ms before,
and optimistic feedback remains in the same 1.6 ms p50 timer bucket.

The candidate and accepted-before Node server entries are byte-for-byte identical at 241,967 bytes
with SHA-256
`1BA875C6DD3F2E38EF48F6792909FCD6D9B602A44C3145BC3B498B665062C2D6`; the Exact response remains
3,794 bytes. Current ordinary Node c16 p50 is 2,061 requests/second for Exact versus 2,243 for React.
Current saturation c32 is 2,415 versus 2,471 requests/second and c64 is 2,404 versus 2,462. Those
movements are environmental rather than attributable to this client-only change. Preloaded c32 is
7,474 versus React's 8,285 requests/second; formal normalization is unavailable because only Exact
and React implement that diagnostic lane.

`npm run performance:check` passed after its full release prerequisite. While assembling the full
report, the SSR comparison adapter was found to omit preloaded saturation data already present in
the raw evidence. It now emits the c8, c32, and c64 preloaded suites for supporting participants;
unsupported SvelteKit and Nuxt cells remain explicit em dashes. The
[complete grouped-percentile report](component-local-target-abi/computed-owner-source-fusion.md)
contains every browser, startup, function-inventory, artifact, Node SSR, allocation,
response-decomposition, equal-payload, preloaded, service-phase, retention, saturation, and separate
Bun diagnostic table. Raw full-run and normalization evidence is under
`.tmp/computed-owner-fusion`; focused alternating evidence is under
`.tmp/computed-value-shared-methods`.

### Compiler-proven indexed task dependency sources

Task activation inputs that are exactly one compiler-proven indexed state or prop read previously
created a reader closure and a tracked reactive computation. The compiler now emits a focused
indexed continuation dependency for those reads. It reuses the receiving component's indexed
dependency identity and subscribes directly to that slot; derived and arbitrary expressions retain
their executable readers and tracked computation owners. The immutable helper selection remains in
compiled component code, while the dependency source retains only request- or instance-owned values
for its own lifetime.

The candidate was refined through two rejected variants. A public reactive-value facade increased
retained heap by 824 bytes, so it was removed. A lower-level subscription API intended to eliminate
temporary setup arrays added reachable code and reduced the heap benefit to 432 bytes; allocation
profiles showed that the short-lived arrays were not the retained cost, so that variant was also
removed. The focused final comparison alternated the accepted and candidate artifacts for 50 pairs:
all 50 measured exactly 1,204 fewer retained bytes, with three fewer profiled and invoked functions
and 141 fewer executed bytes. CPU ratios split by order and do not support a timing claim.

The complete 50-round framework comparison measures 2,509,664 bytes of warm used heap and 2,367,896
bytes at 1x startup, reductions of 936 bytes from the raw accepted-before values. Decoded client code
falls from 196,855 to 196,549 bytes, executed code from 100,593 to 100,328 bytes, profiled functions
from 1,136 to 1,133, and invoked functions from 537 to 534. Raw, gzip, and Brotli client artifacts
all fall. Optimistic feedback remains in the same 1.6 ms p50 bucket and has a worse p95, while
control-normalized startup evaluation changes direction by throttle and percentile; neither is
attributed to this specialization.

The current and accepted-before Node server entries are byte-identical, as are the Bun entries, and
Exact's response remains 3,794 bytes. Current ordinary Node concurrent p50 is 2,084 requests/second
for Exact versus 2,170 for React, approximately 4.0% behind. Because this slice emits no server-code
change, its server timing and RPS movements quantify environmental variation rather than an
implementation effect.

`npm run performance:check` passed after its complete release prerequisite, including 1,967 package
tests, the 335-file native compiler corpus, every application build, all 28 shared browser scenarios,
and the balanced 50-round browser, startup, Node SSR, and Bun diagnostic populations. The
[complete grouped-percentile report](component-local-target-abi/indexed-task-dependency-sources.md)
contains every required framework table. Raw full-run and normalization evidence is under
`.tmp/indexed-task-dependency-accepted`; focused alternating evidence is under
`.tmp/property-operands-combined/indexed-task-direct-source-browser-50`.

### Compact dependency ownership

Each reactive dependency previously allocated a `Set` for its first subscriber and kept a separate
WeakMap from dependency identity to its target and key. The dependency now owns that immutable
identity directly and stores either no subscriber, one scalar subscriber, or a `Set` only after a
second subscriber arrives. Removing a subscriber demotes the population back to its compact scalar
form. Observation transitions, dependency cleanup, atomic-trigger deduplication, and stable
scheduling snapshots retain their existing semantics.

The focused 50-pair alternating comparison measured exactly 1,088 fewer retained bytes in every
pair and in both execution orders. The complete 50-round comparison reproduces the reduction with
2,508,200 bytes of warm used heap and 2,366,668 bytes at 1x startup, respectively 1,464 and 1,228
bytes below the raw accepted-before values. Function inventories are unchanged at 1,133 profiled
and 534 invoked functions. The implementation costs 237 raw client bytes, 65 gzip bytes, 23 Brotli
bytes, and 277 executed bytes. Startup and interaction timings vary by execution order and do not
support a speed claim; the change is accepted for its deterministic retained-heap reduction.

The Exact Node and Bun server artifacts are byte-identical to the accepted-before artifacts, and
the response remains 3,794 bytes. Current Node render-only p50 is 0.0326 ms versus React's 0.0236
ms. Exact saturation p50 is 2,354 requests/second at c8, 2,292 at c32, and 2,291 at c64, versus
React's 2,458, 2,439, and 2,409. An anomalously low ordinary c16 population is contradicted by the
byte-identical interleaved Exact-before worker, so it is retained as environmental evidence rather
than attributed to this client-only change. Sampled Exact render allocation falls from 3,373,328
to 3,297,832 bytes per 100-render profiling batch, but unchanged server artifacts likewise prevent
an implementation claim.

`npm run performance:check` passed after its complete release prerequisite, including 1,968 package
tests, the native compiler corpus, every application build, all shared browser scenarios, and the
balanced 50-round browser, startup, Node SSR, and Bun diagnostic populations. The
[complete grouped-percentile report](component-local-target-abi/compact-dependency-ownership.md)
contains every required framework table. Raw full-run and normalization evidence is under
`.tmp/compact-dependency-owner`; focused alternating evidence is preserved alongside it.

### Compiler-owned hydration reads

The direct SSR executor previously used the generic descriptor-safe reader for compiler-owned
top-level state, prop, and published-root fields, and positional hydration construction repeated
that descriptor inspection for every compiler-declared array slot and object field. The direct path
now reads each declared field once with ordinary JavaScript property semantics while constructing
new getter-free positional arrays. Nested authored resumption values, generic hydration values, and
extension values retain descriptor-safe validation. Generic resumption capture is unchanged.

Instrumented comparison renders reduce `Object.getOwnPropertyDescriptor` calls from 57 to 6. The
six remaining calls are all nested authored fields and deliberately remain defensive. After an
allocation-free own-property guard was restored, all 20 focused alternating pairs still favored the
candidate: median sampled allocation fell from 3,762,904 to 3,336,568 bytes per 100-render batch,
with a 12.32% geometric paired reduction. The descriptor site fell from a 535,784-byte median to
57,736 bytes. A separate 50-pair render population favored the candidate in 33 pairs and in both
execution orders, with a 2.66% geometric reduction. The complete profile records 3,105,832 bytes
versus the preceding checkpoint's 3,297,832 bytes. React also moves from 7,208,376 to 6,903,704
bytes in that cross-run sample, so the 5.8% raw full-profile reduction is supporting evidence rather
than the causal estimate. Complete-run render-only p50 moves from 0.0326 to 0.0340 ms while React
also slows; the direct alternating population resolves that contradictory cross-run movement.

The same-run interleaved prior Exact artifact shows no material Node capacity tradeoff. Ordinary c16
p50 improves 0.44%. Saturation p50 changes by -1.44%, -0.70%, +0.11%, +0.64%, -0.25%, and -0.81%
at c1/c4/c8/c16/c32/c64. The renderer-isolating preloaded lane changes +0.66%, +1.93%, and -1.29%
at c8/c32/c64; equal-8-KiB changes -0.66%, -1.84%, and -1.18%. Current Exact exceeds React at Node
saturation c32 and c64, 2,470 versus 2,427 and 2,407 versus 2,351 requests/second, while ordinary
c16 is effectively tied at 2,116 versus 2,121 requests/second. Bun remains diagnostic: its direct
prior/current p50 comparisons range from +0.80% to -1.54%, with no consistent improvement.

This server-only change leaves client output, executed code, invoked functions, warm retained heap,
and 1x startup heap unchanged at 197,086 transferred bytes, 100,605 executed bytes, 534 invoked
functions, 2,508,200 warm heap bytes, and 2,366,668 startup heap bytes. Control-normalized 1x
evaluation is 17.663 ms versus 18.037 ms before, while 4x is flat and 6x improves; those timing
movements are environmental evidence rather than an attributed client effect. Optimistic feedback
remains 1.6 ms p50. The response remains exactly 3,794 bytes. The Node server artifact grows by 959
raw, 240 gzip, and 246 Brotli bytes, which is acceptable for the measured allocation reduction and
effectively neutral Node capacity.

`npm run performance:check` passed after its complete release prerequisite, followed by all 28
shared browser correctness scenarios and balanced 50-round browser, startup, Node SSR, and Bun
diagnostic populations. The untimed startup source-attribution pass could not load the omitted
production source map; timed startup, precise coverage, function inventory, heap, and all SSR lanes
are complete. The
[complete grouped-percentile report](component-local-target-abi/compiler-owned-hydration-reads.md)
contains every required framework table and the direct interleaved prior/current capacity tables.
Immutable raw evidence and normalization output are under `.tmp/hydration-generated-trust`.
