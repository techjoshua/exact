# JavaScript performance measurement

The [September 12 native Bun adaptive SSR capture](performance-baselines/bun-adaptive-ssr-2026-09-12.md)
refreshes Node and native Bun capacity, response latency, memory, and server measurements with
adaptive admission enabled by default on both hosts. The
[full client capture](performance-baselines/client-full-2026-09-11.md) remains the source of browser,
heap, and startup measurements. Every framework renders its own complete application document.
String and streaming APIs remain separate on both runtimes; browser measurements use the string
lane. eXact, React, and TanStack Start support both SSR lanes. Nuxt and SvelteKit expose string
rendering only in this harness.

The current eXact implementation uses one rendering engine. It streams a completed head before
pending body work and delivers body output incrementally with a configurable 8192-byte threshold.
Hydration remains before the closing tags. Compiler-proven static heads can precede their own
blocking component tasks. The requested application owns hydration independently of an enclosing
server document shell. The final Node HTTP capture uses automatic adapter admission by default.
It retains scheduling only when completed-response capacity and event-loop lag improve against
surrounding immediate controls. Native Bun now also enables adaptive admission through its Fetch
adapter, using native request drain and event-loop delay. The current SSR capture includes that Bun default. The
[adaptive controller investigation](performance-baselines/adaptive-default-node-2026-09-11.md)
records workload changes, response tails, and rejected policies.

The [V8 bytecode follow-up](performance-baselines/v8-attribute-and-child-normalization-2026-09-11.md)
retains one child-normalization result array instead of allocating intermediate arrays for nested
children. Public composition semantics are preserved, and large nested lists avoid the former
variadic-call argument limit. Focused allocation improvements are separate from the current
application throughput measurements.

The [Bun admission recheck](performance-baselines/bun-admission-recheck-2026-09-11.md) finds a
repeatable gain from batching before the native Fetch handler on the current small-document fixture.
It motivated the native adaptive admission policy, which retains scheduling only when trials beat
both surrounding immediate controls. The historical capture itself is not the public benchmark baseline.

The [native Bun admission implementation](performance-baselines/bun-adaptive-admission-2026-09-11.md)
checks the automatic policy against its explicit opt-out on small and large documents. Small string
and stream workloads retain batching; the large string workload rejects it. Native pending-request
accounting preserves body streaming and provides a host-owned drain signal without wrapping Responses.

The [Node admission miss investigation](performance-baselines/node-admission-misses-2026-09-11.md)
traces excess scheduled-demand misses to repeated immediate control periods. The retained policy
shortens adequately sampled controls and rechecks healthy scheduling after 30 seconds, while
retaining earlier workload reassessment and idle cleanup. Focused before/after measurements include
misses, errors, response tails, and unchanged React controls; they supplement the full-suite charts.
The full capture linked above refreshes those charts with the retained admission policy and keeps
all measured populations, missed arrivals, and connection errors visible.

The [client V8 audit](performance-baselines/client-v8-2026-09-11.md) examines the shipped browser
bundles, hydration, list filtering, and incident selection using bytecode, optimization traces,
CPU profiles, and allocation sampling that includes collected objects. It identifies tracking
and teardown storage as priorities and screens two isolated allocation candidates. The
[client allocation follow-up](performance-baselines/client-v8-optimization-2026-09-11.md)
integrates those candidates, a teardown marker stack, and lazy tracking Sets. Focused browser
measurements show approximately 6.5% less filtering allocation and 13.1% less selection allocation,
with small timing differences. The client capture linked above refreshes the public charts with these
changes included; the focused investigations remain separate evidence.

The [client reconciliation investigation](performance-baselines/client-reconciliation-2026-09-11.md)
extends that work to 1,000-row browser workloads. Removing repeated component-root discovery during
keyed sibling updates reduced the warmed all-label replacement case from 93.83 to 8.08 ms. The small
incident fixture changed little. The client capture linked above measures the retained implementation
across the entire suite without applying the larger workload's improvement percentage to the small
application fixture.

## Earlier investigations

The [full-document optimization capture](performance-baselines/post-shell-2026-09-09.md)
is historical and predates shared SSR execution and incremental body delivery. Its implementation
released the rendered shell first, then hydration and closing tags together, while waiting for tree
rendering and tasks that could revise the document. Focused follow-up measurements
are recorded in [early document publication](performance-baselines/early-document-2026-09-09.md);
they do not replace the full capture or its public charts.
The [browser follow-up](performance-baselines/early-document-browser-2026-09-09.md) uses actual
streaming responses for 300 sessions across local and constrained profiles. It found no measurable
paint or readiness improvement from shell-before-hydration publication in the comparison workload.

The [shared SSR execution follow-up](performance-baselines/unified-ssr-2026-09-09.md) records the
migration to promised string APIs and one traversal for both output modes. It includes production
Node/Bun HTTP comparisons and 120 streaming browser sessions. Isolated streaming rendering improved,
isolated string rendering regressed, and browser timing changes were inconclusive. The older
full-document capture predates this migration and remains a historical measurement of its captured build.

The [SSR sink investigation](performance-baselines/ssr-sinks-2026-09-09.md) records shared-renderer
allocation changes, buffered Node response handling, native Bun sink experiments, and transport
isolation. Its focused measurements supplement the full capture and do not replace its charts.

The [compiled-program profiles](performance-baselines/ssr-program-profile-2026-09-09.md) trace current
eXact and React rendering costs to document construction, hydration publication, and runtime stream
consumption. Those profiles motivated compiler support for ordinary document components, implemented
in the following investigation. Temporary allocation variants did not enter the production build.

The [compiled document implementation](performance-baselines/compiled-document-2026-09-09.md)
retains ordinary component compilation for document hosts and proven static content, with existing
dynamic adoption boundaries. It records paired renderer and HTTP improvements on Node and Bun,
plus production browser correctness. The final completion capture now includes this implementation.

The [shared SSR allocation investigation](performance-baselines/ssr-allocation-2026-09-09.md)
records further root-attribute, stateless execution, and keyed-list improvements, along with rejected
experiments and the React gaps observed then. It is historical focused evidence, not the final capture.

The [original full-document baseline](performance-baselines/render-modes-2026-09-09.md) remains
unchanged. The [optimization investigation](performance-baselines/post-shell-optimization-2026-09-09.md)
records 24 experiments, their hypotheses, accepted changes, and measured rejections. Deferred document
hydration improved navigation completion by moving activation after a rendering opportunity; the
investigation and startup profiles report semantic readiness separately from the load event.

The full capture includes startup, client framework scenarios, and every root benchmark command.
Scheduled-demand errors, capacity misses, artifact identities, and raw samples remain in the evidence.
The [September 8 refresh](performance-baselines/full-refresh-2026-09-08.md) is historical: it predates
application-owned document rendering and mixed rendering APIs across runtimes. It cannot isolate
the performance effect of the new document path.

The [SSR throughput investigation](performance-baselines/ssr-throughput-2026-09-08.md) records
renderer optimizations and experimental buffer, pool, and Readable paths. It distinguishes
isolated renderer gains from inconclusive HTTP results and does not replace public charts.
The [request-owned staging experiment](performance-baselines/ssr-staging-2026-09-08.md) adds
configurable byte batching and destruction tests, and records why its legacy-renderer bridge
is not enabled in production.
The [direct writer overflow experiments](performance-baselines/ssr-overflow-2026-09-08.md) compare
splitting, combining, direct overflow writes, and explicit corking. They retain the ordinary writer
and distinguish large-value gains from the costs of handling many small spans.
The [hybrid writer buffer-size comparison](performance-baselines/ssr-buffer-sizes-2026-09-08.md)
holds the overflow policy fixed while testing 2, 4, and 8 KiB staging. It records modest,
workload-dependent differences and leaves production defaults and public charts unchanged.
The [SSR path-cost investigation](performance-baselines/ssr-path-costs-2026-09-08.md) separates
head flushing, span layout, rendering, and encoding costs. String batching improves on byte staging
but trails the ordinary writer; hydration candidates do not justify production changes.
The [hydration validation review](performance-baselines/ssr-validation-costs-2026-09-08.md)
distinguishes representation policies from correctness and resource requirements. It measures
unchecked projection as a cost probe and records the resulting value and field loss.
The [projection-plan and final-encoding experiments](performance-baselines/ssr-projection-plans-2026-09-08.md)
test schema preparation, generated tuple allocation, diagnostic branching, ASCII accounting, and
completed-body Buffer encoding. They retain the current implementation and record a fresh React comparison.
The [paired SSR CPU profiles](performance-baselines/ssr-paired-profile-2026-09-08.md) compare both
production HTTP paths after warmup, normalize samples per completed request, and separate framework
work from telemetry. They retain cheaper request-domain construction, with a renderer gain but an
inconclusive HTTP result.
The [hydration serialization experiments](performance-baselines/ssr-hydration-fusion-2026-09-08.md)
compare fused positional string writers, schema-specific writers, and removal of traversal budgets.
Native JSON over the existing projected records remains faster than the fused candidates. The report
separates isolated hydration timing from complete rendering and makes no new HTTP capacity claim.
The [SSR option review](performance-baselines/ssr-option-review-2026-09-08.md) checks proposed next
steps against source and existing stacks. It supports a narrow response-construction experiment,
corrects the HTTP input attribution, and finds no substantial duplicated hydration state in the fixture.
The [marker necessity review](performance-baselines/ssr-marker-review-2026-09-08.md) traces the
remaining scalar and structural comments. Existing single-expression text joining already elides
markers; extending it to multiple scalar expressions is a bounded experiment with a 126-byte
opportunity in the three-row fixture, not an established throughput gain.
The [text-run experiment](performance-baselines/ssr-text-runs-2026-09-08.md) records the tested
compiler/runtime implementation and its initial HTTP regression. The
[forced-rebuild comparison](performance-baselines/ssr-fresh-build-2026-09-08.md) verifies both marker
strategies with the same optimized scalar writer: markerless retains its isolated rendering gain,
while the HTTP populations disagree about which strategy is faster. The framework retains
markerless adoption; these captures do not establish a repeatable HTTP improvement.
The [HTTP throughput investigation](performance-baselines/ssr-throughput-dive-2026-09-08.md) profiles
the verified markerless build and tests header, adapter, and byte-counter candidates. None is adopted.
An alternating diagnostic bypass finds a modest response-path opportunity, while hydration
publication still offsets much of the HTML-rendering advantage in HTTP samples.
The [native hydration accounting follow-up](performance-baselines/ssr-native-hydration-bytes-2026-09-08.md)
reuses the Node adapter's existing byte counter for hydration output, avoiding the portable
JavaScript scan for non-ASCII payloads. It retains exact output and byte-limit behavior, and records
the rejected response-owner and escaping experiments separately.
The [current hot-path profiles](performance-baselines/ssr-current-hotpaths-2026-09-08.md) compare that
retained build with React on the original and larger Unicode documents. They identify dynamic-text
escaping, hydration serialization and final response encoding as the next experimental targets.
The [hot-path experiments](performance-baselines/ssr-hotpath-experiments-2026-09-08.md) retain native
accounting for long unescaped text and complete-body byte publication to Node. They record paired
HTTP measurements, compatibility checks, and the rejected projection and serialization candidates.
The [request-count audit](performance-baselines/ssr-count-audit-2026-09-08.md) independently reconciles
client counts with server renders and completions. It finds no React counting inflation, but records
substantial run variation and limitations in comparing single means across experiment harnesses.

The earlier [post-efficiency benchmark refresh](performance-baselines/post-efficiency-2026-09-08.md) records
browser, heap, Node, and native Bun reports after fresh builds and both runtime
correctness suites. It includes eXact/React ratios and individual population ratios. Node concurrency
runs were error-free; scheduled demand recorded 13 eXact connection resets and 155 React connection refusals, retained
in the report rather than omitted from the comparison.

The [full audit efficiency review](performance-baselines/audit-efficiency-2026-09-08.md) evaluates
all six audit areas. It retains cheaper task settlement, registry composition, and UTF-8 accounting,
and records rejected collection and validation candidates alongside correctness and browser checks.

The [collection audit efficiency follow-up](performance-baselines/collection-audit-efficiency-2026-09-08.md)
retains a cheaper rollback path for deleted last entries and rejects a broader tradeoff that slowed
head and middle rollbacks. It preserves the audit guarantees and does not replace public chart measurements.

The [post-audit benchmark refresh](performance-baselines/post-audit-2026-09-07.md) measures the
runtime after the adversarial-audit fixes. It refreshes the browser, heap, Node, and native Bun
evidence and separately measures the cost of preserving collection order during transaction rollback.
The [audit isolation follow-up](performance-baselines/audit-impact-2026-09-07.md) leaves a small
Node SSR slowdown unresolved and records a generated task-helper correction that was missing from
the original browser capture. It does not establish that the audit explains React's larger historical gain.

The earlier [current-runtime chart refresh](performance-baselines/current-runtimes-2026-09-07.md)
records the runtime transition and isolates the Node 26 idle-socket fetch delay.

The default measurement runtimes are Node.js 26 and Bun 1.4.2. The public server charts
identify their measured runtime versions; browser charts retain their independent Chromium
capture dates. Node.js 24 compatibility is maintained separately from current-runtime performance.
The Node SSR capacity chart uses the sustained two-driver protocol; Bun server latency and heap
charts use the five-framework interleaved diagnostic protocol, not short-window capacity estimates.

The [SSR follow-through](performance-baselines/ssr-followthrough-2026-09-07.md) completes the
synchronous-promise, concurrency-profile, and repeated-setup investigations. It retains shallow
hydration ancestry with native-Set promotion for depth and existing compiled projectors, rejects
the other candidates, and refreshes public sustained capacity using the rebuilt artifact.

The [sustained SSR load runner](ssr-load-testing.md) adds independent driver/service processes,
fixed-concurrency and scheduled-arrival stages, bounded telemetry, explicit overload accounting,
and counterbalanced process populations. Its time series and protocol remain separate from the
historical short-window captures. The public RPS charts now use admitted sustained captures;
preloaded capacity, normal-loading throughput, and scheduled demand remain separately labeled.
The old short-window RPS headline is superseded, while browser, response-time, payload, and memory
charts retain their own dated evidence.

The [response-path experiment ledger](performance-baselines/ssr-next-experiments-2026-09-07.md)
records four rejected candidates and the fresh normal-loading capture. It also documents replacement
of the public RPS headline and curve with admitted sustained evidence, while keeping load conditions
explicit and preserving historical measurements.

The [first sustained SSR capture](performance-baselines/sustained-ssr-load-2026-09-06.md) compares
frozen old/current eXact and React over two counterbalanced populations. Current eXact improves
c32 throughput by 2.9% over old eXact and is near React. A same-worker data-loading ablation
removes and restores the large queue under scheduled pressure with identical response bytes.

The [preloaded capacity follow-up](performance-baselines/preloaded-ssr-capacity-2026-09-07.md)
compares current eXact and React through concurrency sweeps and scheduled arrivals. Two independent
drivers remove the initial generator bottleneck; both frameworks reach roughly 9,100 RPS at their
best measured fixed concurrency and saturate nearer 7,600 RPS under the tested arrival pattern.

The repository's opt-in performance profile separates correctness checks from repeatable framework
measurements. The tracked
[`javascript-framework.json`](performance-baselines/javascript-framework.json) baseline records the
current client, server, wire, heap, and production-fixture build evidence. It is a comparison point,
not a machine-independent release budget.

The [runtime object shape experiments](performance-baselines/runtime-object-shape-experiments-2026-09-06.md)
record a small retained mount/hydration field-order improvement and two rejected render-program
normalizations, with interleaved startup, update, and heap evidence. Fewer V8 maps alone did not
translate into lower total heap or a demonstrated timing benefit.

The [lazy root observation followup](performance-baselines/lazy-root-observation-2026-09-06.md)
avoids constructing reactive root facades until application code observes them, while retaining root
history from the first renderer publication. It reduced the controlled fixture's post-claim heap by
20,092 bytes and repeated-filter burst time by approximately 8–11% in paired captures. Startup timing
remained inconclusive; applications observing every root still acquire the full lifecycle machinery.

The [full comparison refresh](performance-baselines/framework-comparison-lazy-root-2026-09-06.md)
publishes the subsequent 50-round browser, startup, and SSR measurements plus the new five-round heap
composition capture. It preserves the earlier browser and heap charts, with matching client artifact identities
across browser lanes and separately recorded Node/Bun evidence.

The [sustained-throughput refresh](performance-baselines/ssr-throughput-v2-2026-09-06.md) introduced the
server charts with aggregate RPS, separate burst completion time, deferred response validation, and
500 ms capacity windows selected through a four-population duration study. This changes the measurement
method, so older throughput numbers are historical context rather than a runtime before/after comparison.

The [keyed-boundary full comparison](performance-baselines/framework-comparison-keyed-2026-09-06.md)
supplies the browser, heap, and non-capacity Node server charts. Its short-window RPS charts have
since been superseded by the independent-driver sustained captures described above.
It also records a four-population interleaved old/new audit with identical-code controls, separating
the small three-row fixture's gain from the larger row-heavy experiments.

The [SSR allocation experiments](performance-baselines/ssr-allocation-experiments-2026-09-06.md)
compare shared lazy response accessors and native ASCII-prefix scanning against frozen pre-change
artifacts. Renderer timing, response-object retention, and paired HTTP capacity are reported separately;
these focused experiments do not replace the five-framework chart capture.

The [request-scope followup](performance-baselines/request-scope-experiments-2026-09-06.md) retains
a cheaper disposal path for scopes without owned resources. It records native Node protocol
measurements separately from page SSR and rejects lazy bookkeeping maps after factory-context
throughput concerns despite their retained-memory savings.

The [focused eXact / React SSR check](performance-baselines/exact-react-ssr-2026-09-06.md) measures
the current production builds across four fresh Node process populations. Aggregate c32 throughput
is closely matched (2,427 versus 2,448 RPS), with a small React mean-latency advantage. This newer
two-framework evidence is separate from the complete five-framework chart capture.

The [buffered-accounting experiments](performance-baselines/buffered-accounting-2026-09-06.md)
retain valid byte accounting through compiler-owned recoverable ranges. The refined implementation
reduced render-plus-encoding time and sampled allocation; two three-way HTTP captures keep its
effect separate from React comparisons and do not establish a sustained-throughput win.

The [matched-artifact React gap audit](performance-baselines/exact-react-gap-audit-2026-09-06.md)
compares the verified earlier renderer, current renderer, and unchanged React across fresh process
populations. It separates modest old/new gains from a variable cross-framework gap and explains why
window percentiles within one process population cannot establish a consistent framework ranking.

The [hydration and request-path followup](performance-baselines/hydration-request-path-2026-09-06.md)
records six further experiments and full-request CPU attribution. Only lazy hydration collection
bookkeeping is retained; three-way HTTP throughput is unchanged, and the evidence does not establish
a consistent lead over React.

The [Node output and deferred hydration experiments](performance-baselines/node-output-and-hydration-2026-09-06.md)
separate response assembly from serializing captured hydration records at the footer. They preserve
the native transport diagnostics and distinguish isolated renderer gains from complete HTTP results;
the focused captures do not replace the public comparison charts.

The [immediate-response-write correction](performance-baselines/immediate-response-writes-2026-09-06.md)
tests direct forwarding of every published span and hydration callbacks registered during rendering,
with explicit checks that those callbacks execute only at the document's hydration position. The
earlier footer experiment buffered HTML and must not be treated as evidence for this distinct path.

The [single hydration write followup](performance-baselines/single-hydration-write-2026-09-06.md)
checks the existing shared-record collection and whole-payload serialization, then isolates writing
that JSON once directly between script tags while HTML writes continue immediately to Node.

The [SSR projection study](performance-baselines/ssr-projection-study-2026-09-06.md) profiles small,
list-heavy, and comment-heavy pages, rejects several smaller runtime changes, and measures generated
positional projection with code-size and cold-process tradeoffs. The
[native compiler follow-up](performance-baselines/ssr-native-projection-2026-09-06.md) integrates
selective versioned projectors and confirms their workload-dependent HTTP gains across four fresh
interleaved populations. It retains the separate projected-array loop, preserves older compiled
components and the client bundle, and records the additional server code and memory cost. These
focused synthetic captures do not replace the public framework comparison charts.

The [hydration marker study](performance-baselines/hydration-marker-study-2026-09-06.md) tests keyed
element boundaries, scalar text-length markers, and broad identity-attribute removal separately.
It retains the keyed element boundary, measures compressed response size and retained DOM nodes,
and records the browser costs and protocol counterexample behind the rejected candidates.

A [larger paired confirmation](performance-baselines/lazy-root-confirmation-2026-09-06.md) found a
reproducible 0.082 ms (5.4%) increase in mean first-claim feedback with lazy root observation, alongside
its heap savings. The large c16 server drop in the full capture did not reproduce across four fresh
worker populations; eXact's server artifact was unchanged.

`npm run benchmark:server` complements the isolated framework scenarios with sustained production
HTTP load against the compiler-closed SSR artifact. Node uses `node:http`; Bun is measured both
through its Node compatibility layer and through native `Bun.serve`. Keeping those Bun lanes
separate prevents compatibility transport overhead from being mistaken for renderer cost or native
Bun deployment performance. The benchmark reports client-visible latency and time-to-first-byte
percentiles, server render percentiles, throughput, event-loop delay, peak RSS and heap, and post-GC
memory after each load round. The runner owns and reaps every server process; use its results for
server-performance claims and retain the isolated fixture for precise compiler reachability,
readiness, and request-cleanup regressions.

The cross-framework `npm run measure:ssr` lane additionally records a concurrency saturation curve
at 1, 4, 8, 16, 32, and 64 simultaneous requests. Worker timing separates time through first-byte
publication from response composition and delivery, while event-loop-delay and garbage-collection
telemetry expose stalls that aggregate CPU counters cannot attribute. Saturation uses fixed-duration,
closed-loop windows, so throughput has an equal window population while faster participants retain their
larger observation counts for latency analysis; high-volume per-request arrays are released after exact
percentile summarization instead of remaining live for the multi-runtime run. The harness warms and times the controlled fixture service
before every participant, rotates participant order between runtimes, and records that order.
Its bounded, participant-owned `node:http` keep-alive agent is closed between participants, preventing
client ephemeral-port churn from contaminating the capacity curve.
A discarded two-second c32 capacity prime runs before concurrent measurement, followed by a telemetry reset,
so engine tier-up does not appear as a framework throughput discontinuity in the recorded curve.
The finite concurrent lane uses 50 waves and reports burst completion time. Sustained c32 aggregate RPS
is that historical profile's capacity metric: total completed requests divided by total actual window
seconds, including drain. The public capacity headline now comes from the separately admitted
independent-driver captures rather than this short-window lane.
Window-rate means and percentiles remain separate. Hashing and semantic validation run after each timed
interval; the client retains response bodies until that validation completes. The v2 method therefore
starts a new throughput baseline rather than implying a runtime improvement over v1. A four-population,
balanced window-duration study is available as `framework-comparison/src/measure-ssr-window-sensitivity.mjs`.
For captures using the same measurement method, reports place the raw before/current movement
beside any control-normalized movement. Control normalization answers whether a movement can be
attributed across environments; it neither excuses a large raw regression nor erases a reproducible
raw improvement. A primary metric with an adverse raw movement of 10% or more blocks checkpoint
acceptance until a repeated capture with the same artifacts either reproduces the movement or
demonstrates that the original population was unstable. A reproducible favorable movement remains
an accepted measured improvement even when dispersed controls prevent assigning its exact magnitude
to one change. Repeated captures rotate participant order, retain every raw window, and never select
only the most favorable run.

Attribution counter-metrics include total participant work for every framework and, where the integration
owns the complete renderer call, controlled-data loading, rendering, response-envelope construction, and
rendered/response byte counts. Equal-payload runs hold complete body size at 8 KiB by default, transport-only
payload sweeps isolate response-size sensitivity, and preloaded render-only runs separate renderer cost from
service and socket work. Node render-only diagnostics also retain separate statistical CPU and allocation
profiles with their top source locations. These local-loopback diagnostics explain the comparison; they are not substitutes for
externally generated capacity testing on deployment hardware, and unsupported internal phase boundaries are
reported as unavailable rather than zero.

Server render-program selection must preserve readiness at every nested host, not only at a
component's returned root. If a planned intrinsic subtree contains compiler-proven independent
server-component siblings, server compilation keeps that subtree on the direct issuance lane so
their request-local task frames start before authored-order HTML publication. The compiler does not
trade task parallelism for a compact ordered program.

The dated
[`compiler-planned component execution record`](performance-baselines/compiler-planned-component-execution-2026-08-10.md)
interprets the current planned-SSR, root-cache, shipping retained-heap, and allocation results that
close the delivered execution model's performance criterion.

The dated
[`enhancement capability bundle audit`](performance-baselines/enhancement-capability-bundle-audit-2026-08-12.md)
records the controlled raw, gzip, Brotli, and module-reachability change from moving the DOM
enhancement host beside compiler-resolved providers.

Compiled modules now import focused render, reactivity, task, inspection, registry, ref, keyed-list,
and enhancement facades. The base component constructor has no reverse import to optional ref,
keyed-list, or task implementations: capability code
installs its integration only when reachable, and a compiler-proven component with neither tasks
nor interaction roots allocates no task owner. Event-owning components retain one because event
callbacks execute as cancellable interaction tasks. Each exported component carries one immutable compiled definition; execution-plan and
lazy-island slice indexes are cached by definition rather than rebuilt per instance or request.
Optional enhancement implementations remain outside the core and basic-renderer ledgers.
The enhancement host follows the same reachability rule: provider facades install its versioned DOM
capability, so enhancement-free clients omit chain construction, target selection, reconciliation,
and hydration activation. Lazy components and microfrontends retain that host in their own loading
graph and may register it after a root exists.

Target contributions use the same artifact-selected boundary. A DOM root retains only a
fail-closed bridge and direct ordinary-prop application; a component that emits `_target` imports
the target implementation beside its compiled output. Runtime construction of compiler-internal
target VNodes is intentionally not a second component mode.

Compiled logging and framework diagnostics call one shared logging operation with the durable
component instance, so ordinary logging does not require a facade per component. A facade is
materialized only when dynamic code explicitly reads the public `instance.log` surface. Disabled
default trace and debug checks also avoid constructing component scope records. Default logger and
error contexts remain available through the same context resolution contract. Server artifacts
with canonical logging use a focused request-local logging frame, or reuse their context-bearing
direct frame, so logging alone does not select durable generic SSR ownership.

Canonical `this.intl` access is likewise compiler-linked to the component owner. On the server,
localized components reuse the request-local context frame and its nearest-provider lookup instead
of selecting durable generic SSR construction. The stable localized facade remains cached per
component owner, including direct request frames, without widening context-free artifacts.

Compiler-owned DOM interactions enter through a compiler-marked native event lane. With trace
logging disabled, an ordinary callback executes and publishes its synchronous reactive feedback
without constructing an abort controller, task frame, settlement promise, interaction scope, or
trace arguments. Interaction-capable component records carry their task owner directly under the
framework's cross-bundle symbol, so the event does not perform a second owner-table lookup. The
interaction materializes structural task state only if synchronously invoked work requests it. The
event's publication batch deduplicates reactive work without constructing
inverse mutations or version-range journals; explicit rollback-capable batches and optimistic task
journals retain inverse records, and nesting inside either upgrades the event lane. Durable
mutation-version ranges are retained only by optimistic journals and work nested inside them; an
ordinary synchronous `batch()` does not allocate fencing metadata it cannot expose. DOM traversal
and reconciliation counters are created only after an enabled trace
has materialized its interaction scope. Event generations and task-owner lookup are deferred by the
same boundary. If the callback synchronously starts a task or explicitly joins work, that
operation materializes the canonical interaction frame on demand and retains cancellation,
descendant joining, and structural settlement. An enabled trace logger constructs that same frame
at entry so every phase remains observable. Public and runtime-authored event hosts retain the
general interaction contract.

When the compiler proves a local intrinsic handler has no parameter and does not read implicit
`arguments`, the DOM target owns a direct listener that enters the same interactive publication
operation without constructing or adapting an event argument. This avoids delegated path discovery
while preserving interactive priority, synchronous feedback publication, task ownership, error
routing, and listener cleanup. Handlers with a parameter, implicit argument access, opaque identity,
or runtime provenance retain delegated dispatch and the complete `Event.currentTarget` adaptation
path.

Focus preservation is transaction state on the renderer root rather than a process-wide side table.
Nested DOM work reuses the outer transaction, and an event releases its captured focus and selection
state before returning. Ordinary interactions therefore do not allocate a separate transaction
record or register the root in a `WeakMap`.

Compiler-known top-level component state uses deterministic numeric storage slots behind the
ordinary inspectable `this.state` object. Alias-resolved reads and writes share those slots; nested
mutable containers and dynamically introduced fields retain the general reactive proxy path.
Optimistic journals, SSR resumption, snapshots, and DevTools therefore observe the same state
contract without allocating a property-keyed top-level container for compiled fields.

Retained DOM and computed bindings store their callback, dependencies, scheduling state, and scope
on compact reaction records whose executor methods are shared. Each binding retains one callable
stop handle for public ownership; it does not construct separate run, schedule, error, and release
method closures.

Framework-owned component roots also retain one shared logger lane. Disabled component diagnostics
perform the configured level check directly against that logger rather than walking component
contexts. Defining a component-level `LoggerContext` override selects the dynamic context lookup
lane for that root so authored overrides continue to apply at call time. Compiled DOM interactions
receive a root-proven disabled trace lane directly, avoiding logger discovery altogether when the
shared logger excludes trace events.

Component context lookup, publication, inspection, and SSR context resumption are likewise a
compiler-selected capability. A component module that calls `hasContext`, `getContext`, or
`setContext` imports that implementation beside its artifact; a context-free component runtime
retains only the fail-closed operation boundary. The renderer's private root error context is
installed directly on its opaque root artifact, while DOM and SSR readiness owners directly install
their compiler-known private tokens. Neither path makes authored context traversal reachable in
every application. Compiled-component packages declare import-time purity so an unused provider
re-export does not activate its capability; retaining the provider export still retains the emitted
capability import.

Target-local capability projection happens before constructor and import selection. Server
artifacts omit capability expressions erased with client lifecycle callbacks, client tasks, event
handlers, and ref attributes, while retaining server-observable use and requirements propagated
through external receiver-forwarding helpers. This prevents client-only authoring surfaces from
widening SSR without treating unresolved helper flow as safe.

Closed client and hydrate artifacts give compiler-proven call-only
`TaskContext.client().latest()` functions with the default normal, nonblocking policy a compact task
lane. The lane retains durable owner cancellation, structural interaction settlement, task frames,
cleanup, inspection events, component performance logging, and reactive setup activation, but it
does not allocate general status objects, keyed lane maps, queues, option validators, or generic
generation records. When the same authored function task is called during setup and retained by an
interaction, its declaration owns the single durable definition and both sites invoke that binding.
The setup call does not emit a second task body, dependency plan, identity, or status owner. A task
that escapes as a value, uses optimism, captures authored parameter
defaults, changes readiness or priority, selects another concurrency policy, belongs to a
rendering-mode-neutral artifact, or crosses the server boundary retains the universal task ABI.
Synchronous compiler-owned computations and resumption deferral also live in focused modules so
importing them does not make the universal activation implementation reachable.

Closed client render programs carry executable production claims. The compiler emits cursor claims
only for scalar and structural slots and the intrinsic ancestors needed to reach them. A property
target outside that topology receives one compact element path selected from a compiler-proven
stable edge; a preceding variable-width range therefore cannot perturb a target addressed from the
end. If variable structure makes neither edge stable, the component retains its generated cursor
claims. Inert static intrinsics are never claimed or assigned individual ownership. The successful
path does not walk descriptor tables, build an identity map, or rediscover slots. Every claimed tag,
namespace, scalar sentinel, and structural marker pair is still checked. A stale or malformed plan
therefore fails closed into the existing hydration recovery path. Paired client and server
artifacts combine the same direct client claim lane with a generated SSR writer. The production DOM
executor accepts only that compiler-specialized client ABI; manually constructed table fixtures are
converted to the direct ABI by the testing entry point and are not a browser compatibility lane.

Render-program descriptors are emitted once as immutable module records. Component instances join
only their local expression readers to that shared record; closed client output does not retain a
second generic VNode topology for region-local recovery. It does not allocate a descriptor factory
or repeat cache lookup and freezing. For compiler-proven direct top-level state and props reads,
closed client output assigns dirty bits to the affected text, property, and conditional
structural-child operations. Forwarded reactive props retain their source subscription while
publishing through the same compiler-indexed dirty table, so a branch does not need a retained slot
watcher. Each finite region registers its generated operation function with the durable
component definition. The artifact carries one fixed dependency/mask table and one generated
component updater; each mounted region contributes only its compiler-assigned target index. Every
region in that component therefore shares one dependency subscription and mutation-version table.
When every generated dependency is component state, the artifact imports a state-only binder and
omits forwarded-prop inspection, subscription, and refresh storage. Mixed state/prop artifacts use
a counted prop-slot prefix followed by state slots, so their runtime does not rediscover sources,
map authored field names, or allocate binding-index arrays. This keeps the richer prop semantics
available without making them part of the state-only startup and retained-heap floor.
One generated operation may depend on several top-level slots. The compiler merges those inputs
into the operation's dirty mask for scalar arithmetic, comparisons, logical composition, and
conditionals, avoiding a retained watcher merely because a text or property value has more than
one input. It deliberately leaves nested object reads and arbitrary calls tracked until their full
mutation and dependency behavior is proven.
The binder likewise mounts inert statically resolved native-component slots directly. When a static
component has compiler-indexed live props, its parent update artifact publishes those props through
the retained child instance without a generic structural watcher. Runtime-selected identities and
authored dependency surfaces the compiler cannot close remain structural ranges.
The ordinary case keeps two inline 32-bit mask words. When a component contains more than 64 direct
operations, the compiler extends that same artifact with the exact number of additional words; only
instances of that component allocate the corresponding typed mask storage. Capacity never selects
the removed runtime `WeakMap`/lane graph or a set of per-region reactions. The compiler also links
the wide binder only into those artifacts; ordinary components retain the two-word binder without a
wide-capacity branch or import.
Numeric mutation versions identify the fields that actually changed, and the generated updater
calls only operations whose region target is currently mounted. Region replacement clears its
indexed target, while final component teardown releases the shared reaction. This avoids both
dependency-collection passes and one retained reaction per binding without adding another scheduler
turn. Each invocation also carries its compiler-known durable update owner separately from its
semantic component parent. A transparent enhancement can therefore remain the context parent of
authored descendants without redirecting the enclosed region's generated state updates to the
enhancement instance. Expressions with nested, dynamically indexed, or otherwise incomplete dependencies retain
their independent tracked reaction. This is generated component control flow, not an opcode tape:
the runtime supplies focused claim, subscription, and DOM mutation operations but does not interpret
a general update plan. Closed client output emits each property group as one direct writer
operation: one
invocation applies its known keys in browser-safe order without allocating and enumerating a
temporary props record or redispatching through the generic slot reader for every property. Those
properties are omitted from the client slot dispatcher. Conditional intrinsic roots created inside
a compiler-owned structural range use marker-free intrinsic VNodes; native components retain their
separate marker-free component constructor, so the two identities cannot be confused. Previous
property values occupy a compact
group-indexed array; programs with only text or structural work allocate no property map at all.
Closed hydrate and client artifacts emit their complete claim and binding topology in one direct
executor. Its claim lane wires intrinsic and slot identities; its binding lane calls text,
structural-child, compiler-keyed-child, grouped compatibility-list, and property operations. The DOM
executor invokes those compiler-authored calls without walking or branching over general node,
slot, or binding tables. Published packages retain paired direct client execution and
component-specific server functions; one physical executable artifact is never asked to select
between render targets. They do not make contract-metadata completeness select generic successful
execution. Closed server artifacts emit only that component-specific SSR function: a
generated preparation prefix reads the known slots, then generated calls write static markup,
text, children, and attributes in source order. The SSR runtime supplies escaping, markers,
limits, and recursive child rendering without interpreting node, slot, part, binding, or operation
tables. The direct server facet carries only its compact execution classification and the setup
prop names read before construction. For a compiler-proven synchronous JSX root, the compiler
folds the returned render arrow into the setup implementation and marks that closed form. The
request-local executor writes the resulting prepared program into its sink without allocating a
returned render closure, synchronous issued-result object, or snapshot projection. Forwarded and
arbitrary output retains its callable contract, and scheduled components retain their issued
protocol; there is no parallel fast path for one artifact. Scheduled calls reference
module-level input/output slices emitted from the canonical component dataflow graph; request
execution consumes those constants rather than serializing or rebuilding a generic plan. Synchronous,
scheduled, and dynamic components therefore have an explicit bundle boundary for progressively
removing generic component and task infrastructure without changing the authored component model.
Runtime selection remains target- and capability-specific. Client-only output retains durable
reactive expressions, DOM updates, events, tasks, lifecycle, refs, and contexts because those
values can change after initial mounting. A compiler-closed server module instead imports eager
structural expression operations and omits the reactive scheduler and effect-scope implementation.
If any server-reachable component in the module requires generic ownership, the compiler selects
the reactive server entry for that module rather than weakening its behavior. Hydrated applications
therefore receive a closed server facet and the corresponding durable client facet; the server
optimization is not a compilerless or server-only component model.
When the compiler proves that a synchronous server component needs no durable ownership, it selects
the direct lane. SSR invokes that artifact against a small request-local state
frame and never constructs a durable component instance, reactive scope, task owner, or lifecycle
registry. A context-bearing frame adds only a logical parent, ambient-context reference, and local
map; descendant serialization uses that frame so nearest-provider lookup remains exact across
direct and durable components. Compiler-selected state paths are published from that frame for hydration resumption only
after descendant output succeeds. Expression props are read once into the direct frame instead of
creating the general readonly props proxy. A compiler-keyed list normally writes its item VNodes
through the generated SSR function; its lazy compatibility fallback calls one shared request-local
list operation that creates no controller, registration, cache, or durable owner. Authored
`this.map()` ownership and components that require capabilities not yet projected into a direct
server slice remain on the generic lane; classification alone never weakens their ownership
semantics. The renderer carries component ancestry separately from durable instance ownership, so
a resumable descendant still publishes its client activation boundary when every server ancestor
uses a request-local direct frame.

Canonical ref calls do not by themselves select the generic server lane. Generated server output
links `ref()`, `readRef()`, `refs.get()`, and `refs.root()` directly to a lazy request-local binding
record. SSR never publishes a DOM value, but stable binding identity, authored fulfillment, root
ownership validation, and the empty server root lifecycle remain observable. The focused lane does
not import reactive ref objects or install the universal ref surface. Extracted or dynamic ref
operations stay generic because their eventual semantics are not statically known.

Canonical setup-time `this.reactive()` calls likewise select a focused direct-server value. Its
reader evaluates against the current request-frame state on each observation, preserving freshness
after compiler-scheduled task writes without allocating computed nodes, dependency links, scheduler
registrations, or effect-scope ownership. It remains a framework-branded readonly reactive value
for unwrapping and serialization. Extracted and dynamic factory access stays on the generic lane.

Canonical `onRender()`, `onUnmount()`, and `own()` calls no longer require a durable SSR component
instance. The server artifact links a lifecycle capability only for components that use those
operations, and registration allocates one request-local sidecar on first use. The renderer calls
the linked render hook once per render attempt and releases the sidecar after descendant output is
finished; synchronous and asynchronous cleanup share the same primary-error preservation boundary.
This lifecycle facet composes with context, logging, task, ref, and reactive facets without a
per-request capability mask or combined-constructor dispatch.

Compiler-closed scheduled server components use the same request-local frame plus only their
generated transition slices and disposable port storage. They do not construct a durable
component instance, effect scope, state proxy, lifecycle sidecars, or the generic component
capability graph. State initialization and task mutations remain direct JavaScript writes against
that frame rather than allocating reactive-write closures or resolving runtime state paths.
Cancellable awaits and timers use focused request-signal operations without constructing a
durable task frame. For a compiler-closed direct component, the generated server program captures
all known child slots synchronously while its request-local issuance scope is active. Each known
scheduled child therefore issues its frame before authored-order HTML publication begins, without
constructing the surrounding intrinsic VNode tree or asking the renderer to rediscover task-bearing
components. Generic components retain lazy slot reads and their stabilization semantics. The
request scheduler starts ready child tasks up to its bound before awaiting the first
settlement.
Framework-owned resumption observers are buffered and replayed in authored order; user
component-instance observers retain the serial lane because their timing is observable.

Request context storage is capability-lazy. Resource hints, hydration publication, enhancement
planning, target routing, and prepared-boundary collections allocate only after the rendered tree
uses that feature. Direct task frames store compiler-numbered output ports in indexed arrays and
small path pairs; waiter and subscriber sets appear only when another task actually consumes the
output. A task whose output is rendered but never forwarded therefore pays for neither generic
maps nor dependency subscriber collections.
Closed render-to-string artifacts also serialize their compiler-owned plain boundary state without
linking the reactive keyed-collection registry or dependency-tracking stack. JSON shape and size
validation remain mandatory. Generic reactive component artifacts explicitly install keyed-state
encoding and tracking suppression, while the public hydratable-rendering API retains reactive
collection encoding for explicitly supplied application state.

Server compilation also selects runtime modules rather than importing the universal component
barrel. Compiler-closed output imports structure-only VNode and render-program operations plus
server task helpers. A generic component artifact explicitly installs durable component execution,
enhancement planning, and task ownership; a native Suspense artifact explicitly installs its
structural-boundary capability. Those implementation modules are therefore unreachable from a
closed server bundle that uses neither feature. The performance fixture rejects a closed bundle if
durable component construction, generic component rendering, readiness-owner construction, task
owner construction, reactive scheduler ownership installation, proxy construction, or the
client-style reactive error fallback
reappears.
Manually constructed programs use the explicit DOM testing compatibility helper. Temporary
binder contexts are released after synchronous installation and are not captured by the retained
slot watchers. Server and universal artifacts retain individual readers for SSR, while older
precompiled clients continue through the runtime fallback. A change therefore
evaluates only the affected target group instead of rebuilding props
for every element in the program. The descriptor carries those binding groups in browser-safe
application order, including option values before a controlled select, so mounting does not
rediscover topology with maps or runtime sorting. Replacement invocations also retrack their new
readers rather than retaining dependencies from the previous invocation. This remains direct
compiled DOM work, not a virtual-DOM or general bytecode interpreter.

When a planned property reader is extracted from an authored null-checked branch, generated code
retains that checker proof at the derived-cell read. A narrowed object is read once within an
expression operation, and independently scheduled property readers preserve the non-null contract
instead of emitting invalid optional-object access or adding runtime validation.

Statically resolved native component calls occupy explicit compiler-owned component slots inside an
intrinsic program. The client retains the parent host template and delegates only that child range
to a fixed-cardinality component lifecycle operation. The normal path mounts or patches the one
compiler-proven component directly, without normalizing a child array or entering keyed sibling
reconciliation. Its retained slot state stores the scalar component VNode directly rather than a
duplicate one-element normalized result; error and suspension fallbacks retain the general
structural path. Complete and
server artifacts publish the matching dynamic
boundary while keeping recursive SSR execution. Stateful, interactive, contextual, split-boundary,
transition-owning, and keyed-list components keep their durable instances and ordinary ownership
semantics inside that slot instead of forcing the surrounding intrinsic host through generic VNode
construction.

The first mount of a descriptor consumes its parsed template fragment directly. An inert template
is retained only after a second mount proves that the descriptor is repeated, such as a compiled
keyed-list item. One-off page and component skeletons therefore do not retain a duplicate DOM tree
merely to support a clone that never occurs.

Literal host attributes with identical template, DOM, and SSR semantics are written directly into
the compiler-owned template. They do not become reader branches, binding records, reactions, or
initial `updateProps` work. Values that require URL policy, form binding, event installation,
object normalization, or custom-element property assignment remain explicit runtime operations.
Programs whose component-local binding tuple is empty bypass reactive binding setup entirely: they allocate no
props map, retained watcher, refresh closure, or binding teardown state.

Compiler-emitted descriptors are trusted module-local executable artifacts. The client does not
register them in an authority set or repeatedly validate their internal tables during mount and
patch. Only the private render-program VNode kind selects this executor. Server responses, plugin
payloads, and other external values remain validated at their actual ingress boundaries.
Component definitions follow the same split. Compiler-prepared imports take a shallow executable
artifact check when construction or lazy-island registration reads their contracts; they do not
repeat recursive shape and identity validation already performed by the build. Public contract
readers and framework-fixture entry points retain full validation for manually supplied values.
Hydration entry points likewise pass their owned configuration resolver explicitly. The shared DOM
adoption engine has no complete-runtime default import, so a hydration-only client does not retain
endpoint, continuation, island, or patch configuration merely because the full client supports it.
Build adapters can emit a focused client bootstrap from the aggregate artifact graph. It imports
the server-operation/island client surface only when those capabilities are reachable, composes
the complete continuation table without a separate generated-module normalization pass, and does not ship the
descriptive graph inventory used to make that decision.

Native component functions carry their prepared target artifact. Client mounting and hydration
read that definition once and invoke its linked constructor directly, avoiding a separate native
identity classification and a second contract lookup for every instance. Dynamic component
selection still resolves at execution time, but every selectable native value must carry the same
complete target artifact; foreign functions enter through compiled compatibility boundaries.

Scalar text slots may sit beside static text or other scalar slots in one planned host. When static
markup bounds a slot on both sides, hydratable SSR writes the escaped value directly and the
generated claim lane adopts it without emitting comment delimiters. An empty value receives an
owned empty `Text` node at that compiled boundary. Adjacent text retains anonymous separators so
HTML parsing cannot coalesce independently updated values; the compiler emits the exact resulting
paths for that fallback.
Compiler-owned `className:name` contributions are likewise combined into one planned class
operation in authored order. Conditional class hosts no longer require a generic VNode merely to
preserve class normalization and reactive updates.
Compiler-authored intrinsic form bindings enter planned hosts as their generated controlled-value
and event operations. Static option subtrees remain inside the same template, and the binding table
keeps option initialization ahead of a controlled select value. Authored binding namespaces never
escape into the runtime artifact.

Client render programs may also own a structural child slot inside an otherwise finite intrinsic
host. The slot reuses the server's ordinary dynamic marker identity, adopts the complete SSR-owned
range, and mounts or patches only that range when its compiled reader changes. The server retains
recursive structural rendering for the same source region, so streaming and async ownership do not
become client runtime responsibilities. This lets conditional JSX, fragments, component calls, and
other non-scalar child values stop forcing their surrounding intrinsic skeleton through the generic
client host renderer.

Compiler-known keyed-list expressions in those slots emit their keyed VNode array directly. The
generated binder calls one focused keyed-child operation for that exact slot; it does not register
`this.map()`, create a component list controller, or construct a Fragment/ListBinding wrapper.
Mounting, hydration, and refresh bracket the lane with one component render transaction. Reactive
collection iteration records structural dependencies, while compiler-assigned VNode keys preserve
DOM and component identity across insertion and reorder. When that list is the host's final rendered
child, the compiler uses the parent and end-of-children as its range and emits no structural
delimiters. A following sibling keeps the explicit structural pair that makes the list's end
unambiguous. In either form, SSR emits neither a nested list range nor per-item or compiled-cell
ranges. Explicit `this.map()`, dynamically indexed collections, block-bodied item factories, and
otherwise unproven expressions retain the generic keyed-list path.

Finite fragments produced inside a compiler-owned structural slot lower to their child array. The
existing structural range owns that branch, so adding a Cell and Fragment range inside it would add
no identity or disposal information. Branch children still retain their own component, suspense,
portal, server, or independently variable structural boundaries when those lifetimes require them.

Compiled component contracts also select nested collection interception from their complete state
and props types. Components proven to contain only scalars, functions, plain objects, and arrays use
the object/array proxy entry; `Map`, `Set`, open index signatures, `any`, `unknown`, dynamic
components, and context boundaries retain the general entry. Framework-owned task lanes keep their
Map, Set, and queue as passthrough ownership structures and publish lane creation through a scalar
version, so merely using tasks does not pull collection proxy interception into an otherwise narrow
application. The narrow lane rejects an unexpected Map or Set rather than silently returning an
unobserved collection.

Planned scalar and property slots with dependencies that cannot be represented by the generated
dirty updater expose their computation directly to a retained watcher. They do not allocate an
intermediate computed value each time that watcher reads a slot. Scope-owned reactions execute
callbacks with that scope current, so any reactive work materialized by an update inherits
deterministic teardown ownership. The compiler-owned lanes retain reaction ownership directly and
release it during rebinding or teardown. Callable stop handles remain part of the public reactive
API, but the renderer does not allocate one additional handle closure for every live compiled
binding.

Generic compiler-known list sites carry a stable site identity, source provenance, and key identity.
Their cached item factories run inside per-key item scopes, and removing a key releases its
expressions and keyed-collection metadata after reconciliation. Closed render-program lists instead
give each mounted keyed item its ordinary subtree scope and release that scope when the keyed mount
is removed; they need no parallel list cache because their generated item readers remain live on
the retained mount.

## Commands

Run the complete framework baseline after building the repository:

Runtime changes require the full repository build, including package client/server target generation,
before rebuilding benchmark applications. A TypeScript-only incremental core build does not refresh
those target copies. For focused core preparation, `node scripts/compile-exact-package.mjs packages/core`
performs that generation; rebuild the affected benchmark applications afterward.

```sh
npm run benchmark:framework
```

The release performance profile builds the repository first and then runs the framework, reactive,
compiler, DevTools, and React-compatibility benchmarks after the complete correctness admission
sequence:

```sh
npm run performance:check
```

The npm prerequisite runs `release:check`, the isolated Router v6.3 check, Theme Lab browser
acceptance, and the native compiler corpus first. Correctness and structural failures stop before
measurement. A machine-local native compiler timing excess is recorded as non-publishable timing
evidence and warns without discarding the admitted build. Once those checks exit, the performance
profile runs benchmarks against their existing build; it does not repeat the repository build or
TypeScript 7 compatibility pass.

Update the tracked framework baseline only from a complete Node and Chromium run:

```sh
node scripts/benchmark-framework-performance.mjs --output=docs/performance-baselines/javascript-framework.json
```

`EXACT_FRAMEWORK_BENCH_SAMPLES` controls independent process samples and defaults to `5`.
`EXACT_FRAMEWORK_BENCH_WARMUPS` controls per-process warmups and defaults to `2`. `--node-only` and
`--scenario=<name>` are diagnostic shortcuts; a run using either incomplete mode cannot write a
tracked baseline. `--keep-temporary` retains generated fixture artifacts only for compiler-output
diagnosis.

The focused reactive command includes the repaired compiled keyed-list DOM gate:

```sh
npm run benchmark:reactive
```

To isolate collection mutation costs, run `npm run benchmark:collections`. It measures ordinary
delete/reinsert, committed transactions, and aborted transactions for 1,000- and 10,000-entry Maps
and Sets. Setup and result verification are outside timing. Each case uses three warmups and ten
samples of 100 operations, without observers. Rollback includes the throw/catch cost and verifies
restored insertion order. Transactional deletion records ordering anchors in linear time; ordinary
deletion retains its constant-time path. This microbenchmark is a cost diagnostic, not an application
throughput estimate or a historical speedup claim.

The reactive benchmark also measures scope-owned deep-chain settlement and an equal-result diamond.
The chain guards affected-graph traversal cost; the diamond verifies that equality prevents
downstream execution while reporting settlement timing alongside the collection scenarios.

The shipping fixture also has a manually invoked retained-heap regression test. It warms the
compiler-generated hydratable SSR root with production marker behavior, forces full collections,
and verifies across 1,000 measured requests that each batch plateaus with zero surviving component
instances or effect scopes. A separate retained-heap ceiling catches unowned retained values:

```sh
npm run test:heap -w @exactjs/sample-shipping-calculator
```

This guard is intentionally excluded from ordinary correctness runs because exposed garbage
collection and process heap measurements are diagnostic, environment-sensitive operations.

The paired allocation-sampling guard profiles collected as well as surviving objects after warmup.
It detects regressions that restore marker-mode VNode fallbacks, reactive wrappers for declarative
module collections, nested subtree flattening, eager response-stream encoding, allocation-backed
UTF-8 validation, or key/entry arrays during attribute traversal:

```sh
npm run test:allocation -w @exactjs/sample-shipping-calculator
```

Dependent-foundation candidates are measured one at a time in isolated Node processes:

```sh
npm run benchmark:performance-foundations -- --scenario=transport
```

The supported scenario names are `transport` and `build-host`.
`EXACT_PERFORMANCE_FOUNDATION_SAMPLES` controls outer process samples;
`EXACT_PERFORMANCE_INNER_SAMPLES` controls observations inside each process. These exploratory
measurements become tracked release evidence only when their proposal records an accepted result
and the production implementation retains the same workload as a before/after guard.

The completed render-program, bounded-async-SSR, and hydration-publication experiments remain in
the historical evidence, but their handwritten generic-tree comparators were removed with the
native VNode architecture. Current SSR and hydration coverage uses compiler-produced TSX in the
framework benchmark instead.

The completed dependent-foundation evidence is tracked in
[`dependent-foundations.json`](performance-baselines/dependent-foundations.json) and can be
reproduced after a repository build with:

```sh
node scripts/benchmark-performance-foundations.mjs --output=docs/performance-baselines/dependent-foundations.json
```

The completed stage-16 candidate measurements, counter-metrics, environment, and accept/reject
decisions remain recorded in
[`remaining-optimizations.json`](performance-baselines/remaining-optimizations.json). Their obsolete
handwritten VNode fixture was removed with that architecture; current production workloads are
compiler-produced TSX.

## Measurement contract

The framework suite:

- compiles its TSX fixtures through the production Vite adapter rather than branding a handwritten
  benchmark component as a substitute for compiler output;
- treats fixture compilation, component construction, scenario assertions, browser startup, and
  missing structured output as setup failures rather than slow samples;
- records medians, nearest-rank p95, minimum, and maximum values from fresh Node or Chromium
  processes;
- performs warmups inside each sample process so one sample's optimized state and garbage
  collection cannot contaminate another sample;
- records Node, operating system, CPU, Chromium version, sample count, and warmup count;
- reports raw, gzip, and Brotli sizes for built artifacts and representative SSR and operation
  payloads;
- uses portable elapsed-time and heap measurements for release evidence; and
- exposes garbage collection only for the repeated mount/unmount plateau scenario, without making
  an exact engine-specific byte count a pass condition.

Production fixture builds are also repeated in clean Node processes. Their emitted raw and
compressed byte sizes must be deterministic before the suite reports a build baseline.
Framework-comparison applications with separate Vite client/server configs use
`buildExactViteApplication()` so both emissions share one process and native project generation;
measuring two unrelated CLI startups would obscure compiler and emission work.

## Scenario coverage

The reactive suite includes subtree disposal while unrelated paused computations remain queued.
It measures removal separately from queue setup and verifies that unrelated work survives and runs
on resumption. The [focused experiment record](performance-baselines/scope-disposal-and-compiler-traversal-2026-09-05.md)
retains the empty-queue counter-metrics and the compiler-traversal experiment's inconclusive timings.

| Area                 | Scenarios                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup and mounting | Static and dynamic mount, compiled module evaluation, production fixture build, and raw/gzip/Brotli artifact sizes.                                                            |
| Hydration            | Renderer adoption of matching SSR-style root markers while retaining existing DOM identity.                                                                                    |
| Interaction          | First delegated click, scalar publication, branch replacement, and 1,000-item keyed rotation.                                                                                  |
| Update matrices      | Keyed unchanged/change/sparse/rotation/append/prepend/truncate/splice/replacement, mixed-priority scheduling, and a focused DOM transaction that protects focus and selection. |
| Framework boundaries | Enhancement target reroute, Activity park/reactivate, Suspense settlement, and mixed-tree mount/teardown.                                                                      |
| Component ownership  | Creation/disposal of 2,000 compiled instances, inspectable state/API access, and repeated DOM mount/unmount heap plateaus.                                                     |
| SSR                  | Synchronous trees, CPU-bound async work, I/O-bound async siblings, and progressive first-chunk/completion timing.                                                              |
| Server protocol      | Ordinary operation requests and streaming batches with representative payloads and compressed/uncompressed sizes.                                                              |
| Browser              | Every client/component scenario above in the current Playwright Chromium build, with a new browser process per sample.                                                         |

Server GC telemetry reports unavailable values when the runtime does not advertise `gc` observation
support. Null counts are not zero collections, and comparative GC metrics are omitted when any
participant in the lane lacks observations. Native Bun inspector measurements are separate diagnostics
because enabling the inspector affects throughput. See the
[native GC investigation](performance-baselines/bun-native-gc-ssr-2026-09-11.md).

The framework comparison additionally records FCP, LCP, long-task count and duration, total
blocking time, element/total/comment/text DOM size at semantic readiness, post-GC JavaScript and
embedder heap, backing storage, retained DOM and listener counts, per-script decoded and executed
bytes, function inventory and invocation counts, and parse/compile/evaluation trace attribution.
Executed bytes use the most-specific V8 coverage range for each source interval, so an uncalled
function body is not hidden by its executed top-level script range and nested ranges are not counted
twice. Coverage is best-effort so V8 optimization remains enabled during percentile timing.

One separate diagnostic pass per framework records sampling CPU profiles for cold startup and the
first optimistic interaction plus sampled allocation sites before and after post-interaction
collection. Those profiles preserve raw V8 nodes and ranked URL/function locations for attribution;
the pass uses a 100-microsecond CPU interval, a 4 KiB heap interval, and 6x CPU emulation for the
interaction capture. Attribution-enabled eXact diagnostics join precise executed coverage to source maps and
retain the bundler's actual per-module rendered lengths. Parsed and compiled function counts remain bundle-level
when Chromium omits source locations. An optional post-GC strong-edge dominator snapshot supports retained-heap
investigation without embedding its large raw snapshot. Profiler overhead is intentionally excluded from latency populations, and
sampled heap bytes are not treated as exact retained-heap accounting.

The separate `measure:heap` collector produces balanced, unprofiled post-claim snapshot categories
for the documentation's stacked heap chart. Its arithmetic category means reconcile to mean snapshot
self-bytes, including native nodes; they do not partition the separately measured JavaScript heap
scalar. Capture and publication instructions are in [framework comparison](framework-comparison.md).
The [2026-09-06 capture](performance-baselines/framework-comparison-heap-composition-2026-09-06.md)
retains the raw rounds, classification rules, and interpretation.

The hydration scenario intentionally measures adoption separately from SSR generation. SSR output
size and generation cost have their own scenarios, which keeps the two costs attributable.

Hydration-publication reports separate application-payload, framework-envelope, and whole-response
sizes. Component names, boundary identities, prop schemas, and prop values are application data;
they are not charged to framework size merely because the compact representation stores them in a
response table. Whole-response raw/gzip/Brotli sizes remain required transport counter-metrics so
an envelope optimization cannot hide an application-facing network regression.

The August 6, 2026 production-path run for 200 boundaries measured the framework-owned raw envelope
falling from 18,866 to 5,204 bytes. This envelope includes generated coordinates and attribute
delimiters but excludes the application-owned table values. Its isolated compression grew from 204
to 542 gzip bytes and 92 to 342 Brotli bytes because unique coordinates compress less readily than
repeated attribute names. The separately reported application payload was 20,404 raw bytes.
Whole-response compression remains the authoritative transport counter-metric: raw and Brotli
improved, while gzip grew by 37 bytes. Compressed category measurements are diagnostic rather than
additive because a compressor shares its dictionary across application and framework bytes.

## Baseline and regression policy

The tracked JSON is authoritative measurement evidence for its recorded environment. Compare a
candidate on the same machine and software versions when possible. Investigate changes in the
primary metric together with bundle, payload, heap, and tail-latency counter-metrics; do not accept
a gain that merely moves work into startup or retained state.

The compiled 1,000-item DOM rotation remains a coarse safety gate at a 2,000 ms p95. That generous
limit detects construction failures, runaway reconciliation, and gross regressions without
pretending noisy local timing is a precise cross-machine budget. Add tighter release budgets only
after repeated baselines establish normal variance on supported environments.

Allocation experiments should report both their focused representation measurement and a
production-compiled DOM fixture. Empty scope or component populations isolate baseline ownership
cost, while static, mixed-lifecycle, and keyed-list fixtures detect work shifted into mounting,
patching, or teardown. Do not compare a candidate directly with an older tracked scenario when
intervening renderer features materially changed that workload; first establish a current
same-tree baseline or describe the result as cumulative.

Component activity state is stored directly on the durable component record. Activation and
deactivation operations are shared prototype methods, so an ordinary component does not allocate a
separate activity object or the closure set that would otherwise capture its lifetime. Uncommon
activity blockers, lifecycle registrations, controllers, task state, refs, lists, and localization
remain allocation-on-demand sidecars.

Compiled component definitions also carry a compact runtime ABI describing whether their generated
execution uses a compiled render, authored lifecycle work, the general list capability, collection
interception, or task ownership. A compiler-owned render constructs its direct bindings and
structural readers once. A transparent render that has no JSX host receives one explicit dynamic
range for its returned expression instead of retaining a component-wide watcher. State and prop
changes are then routed by those generated operations. Construction and disposal use the same ABI
to avoid capability-name scans, task lookups, lifecycle-map probes, and list-controller calls that
the component cannot exercise. Framework test fixtures and compatibility artifacts retain the
conservative general path.

The same ABI selects instance storage. Components without lifecycle, runtime-list, or task bits use
a compact render record and therefore have no lifecycle controllers, task capability/state, or
list-disposal branches. A task- or interaction-owning component without lifecycle/list behavior uses
the task record, adding only task ownership and teardown. Components that declare lifecycle or list
ownership use the durable record. This selection happens before setup, so each narrower path reduces
construction and retained shape rather than merely leaving universal fields undefined after
allocation.

The compiler also selects the authored component surface itself. The base durable instance owns only
the state machine and its always-valid context operations. Canonical lifecycle registration and
resource ownership calls lower directly to focused kernel operations; they neither install nor look
up authored prototype methods at runtime. Refs, general lists, localization, explicit reactive
values, and the noncanonical logger facade are installed by focused runtime entries only when emitted
code uses them. Dynamic or extracted lifecycle member access conservatively selects that same focused
compatibility surface. Type declarations retain the complete authoring interface, but they emit no
universal prototype implementation. This keeps an unused feature's imports unreachable instead of
relying on a lazy field to disguise a bundle-level dependency.

Compiler-indexed component state uses one proxy handler and numeric dependency identities per
state object. Instances of the same compiled definition share its immutable key-to-slot layout;
only a component that introduces a dynamic field allocates an instance-local extension map.
Initialized fields are ordinary data properties on the inspectable backing record;
they do not allocate getter and setter closures for every declared field. A compact indexed bitmap
tracks field presence for deletion, snapshots, and optimistic rollback, while fields introduced
dynamically retain the same reactive fallback semantics and receive stable indexes on first write.
Generated client expressions read compiler-proven top-level fields by numeric slot, bypassing the
facade's property trap and string-to-index lookup. The direct read still records the backing
target's numeric dependency in the shared reactive graph; it is therefore not a parallel signal
implementation and preserves synchronously current transitive computed reads. The inspectable
facade remains the boundary for authored aliases, dynamic access, external code, snapshots, and
DevTools. Plain request-local SSR state does not pay for the client indexed-read helper.
Canonical top-level client writes also address the proven numeric slot directly while retaining
replacement reconciliation, mutation journals, batching, and dependency notification. A
checker-proven alias of the complete state facade keeps this indexed identity; nested-state aliases
and dynamic writes keep the generic path lane rather than accepting an unsafe slot proof.
The generated indexed-write call carries its right-hand value directly. It does not allocate a
one-use value-returning thunk, and a function-valued state assignment therefore remains ordinary
data rather than an overloaded callback convention. Primitive and first-value writes commit
without an inner transaction callback; an enclosing interaction or optimistic journal still owns
their notification and rollback semantics. Object-to-object replacements retain the reconciled
transaction lane because one authored assignment may update several observed nested keys.
Generated form and component-binding callbacks carry the authored slot identity through island and
callback synthesis instead of recovering component ownership from the generated syntax tree.
Managed client computations and task callbacks use the same analyzed slot identity, including when
their work closes over a checker-proven alias of the complete state facade.

A compiler-proven direct state operand passed through a component operation uses the indexed slot
itself as its reactive source. The instance's indexed record retains at most one small readonly
descriptor per used slot, shared by every operand for that slot. These descriptors allocate no read
closure, computed reaction, dependency set, or scheduler entry. Derived expressions and structural
ranges keep the general computed path because they own evaluation, caching, and invalidation rather
than merely forwarding one slot. Generated descriptor calls retain their slot identity in component
update tables; finalizing a prop or `children` value therefore cannot detach its parent update.
Compiler-proven scalar text reads use the same storage identity in component-local render-program
wiring. The immutable operation carries a compact state-or-props source and slot tuple; its focused
DOM operation reads the durable owner directly. Other text expressions keep their generated reader,
so this specialization does not introduce a general expression interpreter or transfer computation
ownership into the renderer.

Every compiled component definition carries immutable state and props layouts, including explicit
empty layouts. Client construction therefore has one compiler-indexed storage contract rather than
selecting a generic facade at runtime. Proven top-level props reads bypass the facade's property
trap; dynamic keys extend the same readonly facade with stable instance-local indexes. Parent
updates reconcile through those numeric dependency identities. Generated client islands preserve
the parent component's complete state layout so reads and form bindings retain their original slot
numbers even when the request serializes only the island's required state paths. Island-specific
transport props receive a separate generated layout and direct numeric reads. Server artifacts
carry the same layouts for contract consistency, while compiler-closed direct SSR continues to use
plain request-local records and never constructs the reactive facade.

Render-program hydration stores only directly claimed compiler-numbered elements in a sparse
ephemeral array. Inert static intrinsics remain covered by their enclosing component or structural
range and receive no element-owner records. The closed client path allocates neither string keys nor
marker maps. Table-backed generic regions use the same dense numeric node identity and bounded
indexing path; authored string identities are not an alternate render-program representation.
Browser artifacts also omit the generic VNode fallback formerly retained beside complete render
programs. Their specialized template handles construction, while hydration failure escalates to the
root recovery path instead of retaining and invoking a second region topology.
The DOM renderer's framework-owned root boundary follows the same rule. Its render operation runs
once at construction and is invoked explicitly by the root update path; it does not retain a
component-wide reactive watcher. This preserves the existing marker-free root topology and error
ownership while avoiding an extra dependency subscription on every client navigation.

Successful compiled scalar hydration emits no opening or closing sentinels when static markup proves
the text boundary. When one scalar is adjacent only to authored static text, the compiler projects
that text into the same focused operation: the immutable wire retains the prefix and suffix while
the expression keeps its existing reader or indexed operand. When several scalar expressions and
static text fill an intrinsic, the server omits their sentinels. Initial client bindings collect
the expected values once; adoption validates the complete text and uses `Text.splitText()` to
retain independent reactive nodes. Mixed structural content retains its boundary strategy.
Ambiguous adjacent text releases its fallback sentinels after
transferring ownership to the claimed `Text` node. Structural child markers remain when a later sibling requires
an explicit variable-width boundary. A native component emitted directly by a generated component
slot uses that slot's structural delimiters, or the parent end for a final keyed slot, instead of
emitting a second component-marker pair. If the same slot executes through a generic list lane, its
explicit component marker remains authoritative; hydration recognizes that bounded form before
using the direct markerless claim. Scalar bindings already retain their exact node and do not need
a second permanent range representation. Within a compiled keyed-child range,
inferred list, item, and cell markers are never emitted. Any compiler-proven final structural child
or component omits its outer structural pair and uses the parent plus end-of-children as its retained
range. A finite conditional Fragment
likewise emits its children into the existing structural range rather than adding nested cell and
fragment markers.

Marker-mode SSR does not give finite compiled render programs generic cell ranges. The client
validates their roots, structural boundaries, dynamic nodes, and property targets through generated
claims; inert nested intrinsics remain ordinary DOM. Component and independently variable-width
boundaries retain explicit ranges because their update lifetime may replace the currently rendered
root shape. Compiler-owned keyed items use their keyed mounted roots, and inlined finite fragments
use their enclosing structural range, instead of duplicating those boundaries.

Closed server component artifacts carry generated SSR execution rather than a compact interpreted
tape. The compiler emits slot preparation and the exact static, text, child, and attribute
calls in source order; server-only descriptors omit the client template and all generic topology
tables. Direct server components also emit their ordered slot values as an array expression; they
do not allocate a temporary slot-dispatch closure for the runtime to call once per slot and discard.
Structural child and component calls delegate only their owned value to the ordinary child
renderer. Asynchronous and streaming renderers execute the same generated calls and defer only each
prepared child value to their ordinary async or chunk renderer; they do not reconstruct the host
through the generic fallback. Hydrate-only client artifacts omit server markup and execution.
Paired package outputs keep client and server execution in separate target-local modules rather
than retaining a neutral table as a compatibility boundary. When one module contains both direct
and generic server components, its
generated imports preserve those lanes independently: generic components retain reactive render
helpers while direct components obtain the server-only prepared-program constructor.

Hydratable renderers also retain each component's compiler-declared state and context order while
capturing its readable resumption record. The in-memory result keeps authored path names for
inspection, but the response encodes captured values as bounded index/value pairs. Hydration first
validates the tuple shape, then expands those indexes against the receiving component's prepared
contract; duplicate, negative, non-integer, or out-of-contract indexes fail closed. This avoids
repeating state-path strings in every response without making the wire format an authority source.

String and stream rendering now share one component executor and traversal. Compiler-selected
root helpers preserve marker proofs while returning promises through that same engine. Completed
tasks introduce no internal await; pending dependencies and asynchronous cleanup retain explicit
ownership. Earlier measurements of separate synchronous and asynchronous engines describe their
captured builds, not the current implementation. The [shared-renderer investigation](performance-baselines/unified-ssr-2026-09-09.md) records its
own before/after captures rather than changing those historical baselines.

When a closed marked graph contains an isomorphic continuation, its server definition carries the
prepared resumption publication kind and authored component name. The direct publisher feeds those
facts to the serialization operation instead of rescanning implementations and continuations after
every component render. A server-only task never selects client-resumption formatting merely
because its component is exported.

Compiler-created synchronous setup computations are also target-specialized. On the server their
already-known dependency expressions feed the generated computation directly in authored order;
the artifact does not construct a task definition, reactive dependency wrapper, readiness watcher,
continuation executor, or transition port for that work. Authored tasks retain their declared
scheduling, cancellation, readiness, and inspection semantics. On the client, an exact top-level
prop-slot read that performs one direct indexed state write becomes an immutable receiver-owned
input-update plan. The initial write stays in authored setup order; later finalized prop batches
route one dirty mask through the receiving instance. Nested reactive reads, authored calls, and
arbitrary expressions continue to use durable computation ownership because a top-level prop slot
cannot represent their complete dependency semantics.

Target projection also closes over deferred client work before runtime imports are selected. A
client-placed function task that remains referenced by server-rendered component props becomes an
inert callable value; its TaskContext default, browser body, task definition, and durable host do
not enter the server artifact. The same rule applies when the callback travels through a
server-rendered view helper rather than appearing directly on JSX; unreferenced placeholders are
removed after projection. Canonical mount, activate, and deactivate registrations are erased
with their callback dependency graphs because those phases cannot run during SSR. Server-relevant
render, unmount, and owned-resource cleanup remain intact. Runtime ABI and side-effect imports are
then computed from the projected transitions and lifecycle surface rather than the target-neutral
source analysis.

For stage-16 candidates without a proposal-specific threshold, CPU or latency must improve its
target median by at least 10%, and retained or peak heap must improve by at least 15%. No
representative counter-metric median may regress by more than 3%, p95 by more than 5%, or compressed
emitted bytes by more than 1%. Correctness, cleanup, cancellation, security, and deterministic
output remain unconditional gates. The dominant `Mounted` experiment instead uses its explicit 5%
mixed-tree/keyed-workload, neutral-teardown, and at-most-10%-heap-growth gate.

The controlled client runners now isolate browser work by replaying captured production HTML and
assets through the same HTTP implementation after stopping framework servers. Browser charts and
heap composition use separate replay captures; SSR data keeps its independent date and method.
See [captured-page client measurements](../framework-comparison/methodology.md#captured-page-client-measurements).

The September 7 framework audit refreshes all five frameworks' sequential response latency,
16-request burst completion, retained server heap checkpoints, and response payload diagnostics.
These are separate from independent-driver sustained capacity. Use
`scripts/component-local-target-abi/refresh-docs-ssr-report.mjs` with `--diagnostics-only` to refresh
those fields without replacing capacity or browser evidence. Public metadata records sequential,
burst, and retention sample counts separately. The audit retains alternate warmup runs as
diagnostics rather than merging their populations or assigning host drift to a runtime change.

The [framework audit](performance-baselines/framework-audit-2026-09-07.md) records the latency
replications, interaction-phase analysis, heap experiments, and acceptance decisions.

The follow-up [reactive subscription experiments](performance-baselines/reactivity-hypotheses-2026-09-07.md)
retain unchanged dynamic-watcher memberships, document the accepted code-metadata cost, and fix
observation retained by callbacks that read state after disposing their scope. The report separates
synthetic CPU gains from paired browser timing and records the descriptor, mutation-version, and
initial-collection allocation candidates that were not integrated.

The [post-restart capture](performance-baselines/post-restart-2026-09-07.md) supplied an earlier
public baseline, with scheduled arrivals subsequently refreshed from a same-plan diagnostic rerun.
The [subsequent concurrency refresh](performance-baselines/concurrency-refresh-2026-09-07.md)
then updated its preloaded concurrency curve while retaining other metric groups' capture dates.
The [post-audit refresh](performance-baselines/post-audit-2026-09-07.md) now supplies the public
browser, heap, Node, and native Bun charts, including every sustained-capacity lane.
The [runtime upgrade verification](performance-baselines/runtime-upgrade-2026-09-07.md) separately
compares old and current Node/Bun releases, records compatibility fixes, and leaves the framework
comparison charts unchanged.
Scheduled-arrival tables retain explicit
request-error counts and rates; concurrency capacity captures still require zero request errors.

The [arrival-error investigation](performance-baselines/arrival-errors-2026-09-07.md) records
the unrecoverable historical error codes, three diagnostic sequences, and the driver and Node
adapter logging fixes. Its error-free rerun supplied the earlier scheduled-arrival charts;
the original error counts remain in the historical evidence.

The [native Bun comparison](performance-baselines/native-bun-2026-09-07.md) replaces the peers'
compatibility serving with React's Bun streaming renderer, SvelteKit's Bun adapter, and Nitro's Bun
preset for Nuxt and TanStack Start. All five production targets pass the shared browser contracts.
The docs page now includes separate Bun sustained-capacity, response-size, and payload-composition
charts, with refreshed five-framework Bun diagnostics. Node and Chromium evidence retain their
independent capture dates. The two-driver Bun sweep and scheduled-demand captures completed without
request errors; the report preserves capacity misses separately.

The [docs development startup investigation](performance-baselines/docs-development-startup-2026-09-07.md)
traces the slow first Vite navigation to eager article loading and synchronous transforms. A finite
lazy article registry reduces the measured first visit from 25.8 seconds to roughly 7 seconds while
preserving the standalone single-HTML production build. Production benchmark charts are unaffected.
