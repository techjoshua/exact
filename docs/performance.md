# JavaScript performance measurement

The repository's opt-in performance profile separates correctness checks from repeatable framework
measurements. The tracked
[`javascript-framework.json`](performance-baselines/javascript-framework.json) baseline records the
current client, server, wire, heap, and production-fixture build evidence. It is a comparison point,
not a machine-independent release budget.

`npm run benchmark:server` complements the isolated framework scenarios with sustained production
HTTP load against the compiler-closed SSR artifact on Node and Bun. It reports client-visible
latency and time-to-first-byte percentiles, server render percentiles, throughput, event-loop delay,
peak RSS and heap, and post-GC memory after each load round. The runner owns and reaps every server
process; use its results for server-performance claims and retain the isolated fixture for precise
compiler reachability, readiness, and request-cleanup regressions.

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
error contexts remain available through the same context resolution contract.

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
`arguments`, delegated dispatch calls it without redefining `Event.currentTarget`. Handlers with a
parameter, implicit argument access, opaque identity, or runtime provenance retain the complete
event adaptation path.

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

Closed client and hydrate artifacts give compiler-proven call-only
`TaskContext.client().latest()` functions with the default normal, nonblocking policy a compact task
lane. The lane retains durable owner cancellation, structural interaction settlement, task frames,
cleanup, inspection events, component performance logging, and reactive setup activation, but it
does not allocate general status objects, keyed lane maps, queues, option validators, or generic
generation records. A task that escapes as a value, uses optimism, captures authored parameter
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
therefore fails closed into the existing hydration recovery path. Complete rendering-mode-neutral
artifacts combine the same direct client claim lane with a generated SSR writer and a generated
recovery factory; manually constructed and older compatibility programs alone retain the
table-driven adopter.

Render-program descriptors are emitted once as immutable module tables. Component instances join
only their local expression readers and optional recovery function to that shared table; they do
not allocate a descriptor factory or repeat cache lookup and freezing. For compiler-proven direct
top-level state reads, closed client output assigns dirty bits to the affected text and property
operations. Each finite region registers its generated operation function with the durable
component definition. The artifact carries one fixed dependency/mask table and one generated
component updater; each mounted region contributes only its compiler-assigned target index. Every
region in that component therefore shares one dependency subscription and mutation-version table.
Numeric mutation versions identify the fields that actually changed, and the generated updater
calls only operations whose region target is currently mounted. Region replacement clears its
indexed target, while final component teardown releases the shared reaction. This avoids both
dependency-collection passes and one retained reaction per binding without adding another scheduler
turn. Expressions with nested, dynamically indexed, or otherwise incomplete dependencies retain
their independent tracked reaction. This is generated component control flow, not an opcode tape:
the runtime supplies focused claim, subscription, and DOM mutation operations but does not interpret
a general update plan. Closed client output emits each property group as one direct writer
operation: one
invocation applies its known keys in browser-safe order without allocating and enumerating a
temporary props record or redispatching through the generic slot reader for every property. Those
properties are omitted from the client slot dispatcher. Their previous values occupy a compact
group-indexed array; programs with only text or structural work allocate no property map at all.
Closed hydrate and client artifacts emit their complete claim and binding topology in one direct
executor. Its claim lane wires intrinsic and slot identities; its binding lane calls text,
structural-child, compiler-keyed-child, grouped compatibility-list, and property operations. The DOM
executor invokes those compiler-authored calls without walking or branching over general node,
slot, or binding tables. Complete rendering-mode-neutral artifacts retain direct client execution,
a component-specific server function, and a region recovery factory because the same physical
artifact may execute through either renderer. They do not make contract-metadata completeness
select generic successful execution. Closed server artifacts emit only that component-specific SSR
function: a
generated preparation prefix reads the known slots, then generated calls write static markup,
text, children, and attributes in source order. The SSR runtime supplies escaping, markers,
limits, and recursive child rendering without interpreting node, slot, part, binding, or operation
tables. The direct server facet carries only its compact execution classification, the setup prop
names read before construction, and its generated render function. Scheduled calls reference
module-level input/output slices emitted from the canonical component dataflow graph; request
execution consumes those constants rather than serializing or rebuilding a generic plan. Synchronous,
scheduled, and dynamic components therefore have an explicit bundle boundary for progressively
removing generic component and task infrastructure without changing the authored component model.
When the compiler proves that a synchronous server component needs only its generated render
artifact, it selects the direct lane. SSR invokes that artifact against a small request-local state
frame and never constructs a durable component instance, reactive scope, task owner, or lifecycle
registry. Compiler-selected state paths are published from that frame for hydration resumption only
after descendant output succeeds. Expression props are read once into the direct frame instead of
creating the general readonly props proxy. A compiler-keyed list normally writes its item VNodes
through the generated SSR function; its lazy compatibility fallback calls one shared request-local
list operation that creates no controller, registration, cache, or durable owner. Authored
`this.map()` ownership and components that require capabilities not yet projected into a direct
server slice remain on the generic lane; classification alone never weakens their ownership
semantics.

Compiler-closed scheduled server components use the same request-local frame plus only their
generated transition slices and disposable port storage. They do not construct a durable
component instance, effect scope, state proxy, lifecycle sidecars, or the generic component
capability graph. State initialization and task mutations remain direct JavaScript writes against
that frame rather than allocating reactive-write closures or resolving runtime state paths.
Cancellation-aware awaits and timers use focused request-signal operations without constructing a
durable task frame. The compiler preserves proven independent server children as direct calls instead
of selecting an ordered render-program representation that would erase readiness information. Each
known scheduled child VNode issues its frame while the generated parent render function creates it;
the renderer does not walk the resulting host tree to rediscover task-bearing components. The
request scheduler starts ready child tasks up to its bound before awaiting the first settlement.
Framework-owned resumption observers are buffered and replayed in authored order; user
component-instance observers retain the serial lane because their timing is observable.

Server compilation also selects runtime modules rather than importing the universal component
barrel. Compiler-closed output imports structure-only VNode and render-program operations plus
server task helpers. A generic component artifact explicitly installs durable component execution,
enhancement planning, and task ownership; a native Suspense artifact explicitly installs its
structural-boundary capability. Those implementation modules are therefore unreachable from a
closed server bundle that uses neither feature. The performance fixture rejects a closed bundle if
durable component construction, generic component rendering, readiness-owner construction, task
owner construction, or reactive scheduler ownership installation
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
Programs whose binding table is empty bypass reactive binding setup entirely: they allocate no
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

```sh
npm run benchmark:framework
```

The release performance profile builds the repository first and then runs the framework, reactive,
compiler, DevTools, and React-compatibility benchmarks without competing correctness work:

```sh
npm run performance:check
```

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
npm run benchmark:performance-foundations -- --scenario=render-plan
```

The supported scenario names are `render-plan`, `async-ssr`, `hydration-publication`, `transport`,
and `build-host`. `EXACT_PERFORMANCE_FOUNDATION_SAMPLES` controls outer process samples;
`EXACT_PERFORMANCE_INNER_SAMPLES` controls observations inside each process. These exploratory
measurements become tracked release evidence only when their proposal records an accepted result
and the production implementation retains the same workload as a before/after guard.

The completed dependent-foundation evidence is tracked in
[`dependent-foundations.json`](performance-baselines/dependent-foundations.json) and can be
reproduced after a repository build with:

```sh
node scripts/benchmark-performance-foundations.mjs --output=docs/performance-baselines/dependent-foundations.json
```

Remaining stage-16 candidates use the focused production and representation fixtures in
`scripts/performance/remaining-optimizations.mjs`. Their five-process measurements, counter-metrics,
environment, and accept/reject decisions are tracked in
[`remaining-optimizations.json`](performance-baselines/remaining-optimizations.json). A measured
rejection is final for the recorded profile; it leaves no production implementation behind.

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

The framework comparison additionally records FCP, LCP, long-task count and duration, total
blocking time, element/total/comment/text DOM size at semantic readiness, per-script decoded and
executed bytes, function inventory and invocation counts, and parse/compile/evaluation trace
attribution. Executed bytes use the most-specific V8 coverage range for each source interval, so an
uncalled function body is not hidden by its executed top-level script range and nested ranges are
not counted twice.

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
execution uses a compiled render, authored lifecycle work, the general list capability, or task
ownership. A compiler-owned render constructs its direct bindings and structural readers once;
state and prop changes are then routed by those generated operations rather than by a second generic
component-render watcher. Construction and disposal use the same ABI to avoid task lookups,
lifecycle-map probes, and list-controller calls that the component cannot exercise. Framework test
fixtures and compatibility artifacts retain the conservative general path.

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
state object. Initialized fields are ordinary data properties on the inspectable backing record;
they do not allocate getter and setter closures for every declared field. A compact indexed bitmap
tracks field presence for deletion, snapshots, and optimistic rollback, while fields introduced
dynamically retain the same reactive fallback semantics and receive stable indexes on first write.

Render-program hydration stores only directly claimed compiler-numbered elements in a sparse
ephemeral array. Inert static intrinsics remain covered by their enclosing component or structural
range and receive no element-owner records. The closed client path allocates neither string keys nor
marker maps. Legacy authored identities and compatibility programs retain the bounded indexing path
because they do not carry a compiler-generated claim lane.

Successful compiled scalar hydration emits no opening or closing sentinels when static markup proves
the text boundary. Ambiguous adjacent text releases its fallback sentinels after transferring
ownership to the claimed `Text` node. Structural child and component markers remain when a later
sibling requires an explicit variable-width boundary; scalar bindings already retain their exact
node and do not need a second permanent range representation. Within a compiled keyed-child range,
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
tables. Structural child and component calls delegate only their owned value to the ordinary child
renderer. Asynchronous and streaming renderers execute the same generated calls and defer only each
prepared child value to their ordinary async or chunk renderer; they do not reconstruct the host
through the generic fallback. Hydrate-only client artifacts omit server markup and execution.
Complete rendering-mode-neutral artifacts retain the table representation as an explicit
compatibility boundary.

Compiler-created synchronous setup computations are also target-specialized. On the server their
already-known dependency expressions feed the generated computation directly in authored order;
the artifact does not construct a task definition, reactive dependency wrapper, readiness watcher,
continuation executor, or transition port for that work. Authored tasks retain their declared
scheduling, cancellation, readiness, and inspection semantics. Client artifacts continue to use
durable reactive activation because those dependencies can change after hydration.

Target projection also closes over deferred client work before runtime imports are selected. A
client-placed function task that remains referenced by server-rendered component props becomes an
inert callable value; its TaskContext default, browser body, task definition, and durable host do
not enter the server artifact. Canonical mount, activate, and deactivate registrations are erased
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
