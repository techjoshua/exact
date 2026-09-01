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
