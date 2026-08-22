# JavaScript performance measurement

The repository's opt-in performance profile separates correctness checks from repeatable framework
measurements. The tracked
[`javascript-framework.json`](performance-baselines/javascript-framework.json) baseline records the
current client, server, wire, heap, and production-fixture build evidence. It is a comparison point,
not a machine-independent release budget.

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
default trace and debug checks also avoid constructing component scope records or empty ancestor
context maps. Components call the nearest shared logger only after checking that the requested
level is enabled; component identity and payload records are then built for that enabled call.
Default logger and error contexts remain available through the same context resolution contract.

Compiler-owned DOM interactions enter through a compiler-marked native event lane. With trace
logging disabled, an ordinary callback executes and publishes its synchronous reactive feedback
without constructing an abort controller, task frame, settlement promise, interaction scope, or
trace arguments. DOM traversal and reconciliation counters are created only after an enabled trace
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

Compiler render programs also carry production hydration identities. Elements and host-property
slots use dense program-local indexes rather than repeating stable IDs in templates and node
tables; structural child ranges use their emitted identities. The bounded adopter skips the
contents of those ranges, so nested component elements cannot perturb or collide with a parent's
local traversal indexes. Only
scalar text slots retain a local path because markerless HTML has no identity marker for a text
node. The adopter builds one ephemeral identity index for the bounded program region and releases
it after the claim, so variable-width structural children do not invalidate later addresses and no
hydration index remains in live component state. Every claimed tag, namespace, compiler identity,
and dynamic marker pair is still checked. A stale or malformed plan
therefore fails closed into the existing hydration recovery path, while markerless and generic
hydration remain available for inputs that do not carry the compiler plan.

Render-program descriptors are emitted once as immutable module tables. Component instances join
only their local expression readers and optional recovery function to that shared table; they do
not allocate a descriptor factory or repeat cache lookup and freezing. The DOM executor retains
independent reactions for text slots and for the compiler-known property group on each target
element. Closed client output emits each property group as one direct writer operation: one
invocation applies its known keys in browser-safe order without allocating and enumerating a
temporary props record or redispatching through the generic slot reader for every property. Those
properties are omitted from the client slot dispatcher. Their previous values occupy a compact
group-indexed array; programs with only text or structural work allocate no property map at all.
Server and universal artifacts retain individual readers for SSR,
while older precompiled clients continue through the runtime fallback. A change therefore
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

Scalar text slots may sit beside static text or other scalar slots in one planned host. The
compiler inserts anonymous template-only comment separators so HTML parsing cannot coalesce their
text nodes, then emits the exact resulting paths. The separators carry no protocol identity; SSR
continues to use request-owned dynamic markers and the hydration tape addresses those separately.
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

Compiler-known keyed-list expressions in those slots are grouped into one render lane. Mounting,
hydration, and refresh bracket the complete group with one component render transaction, so list
registrations are reconciled together instead of leaving one retained reaction and lifecycle pass
per structural expression. Each compiled list binding carries the collection's stable structural
reference, including collections stored in indexed component state, so in-place mutations schedule
that lane directly instead of depending on incidental reads during DOM binding. Dynamically indexed
or otherwise unproven list expressions retain the generic structural path.

Planned scalar and property slots expose their computation directly to the render program's owned
watcher. They do not allocate an intermediate computed value each time the watcher reads a slot.
Scope-owned watchers also execute callbacks and scheduling hooks with that scope current, so any
reactive work materialized by a structural update inherits deterministic teardown ownership.

Compiler-known list sites carry a stable site identity, source provenance, and key identity even
when authored `Array.map` syntax is lowered directly. Cached item factories run inside per-key item
scopes; removing a key releases its expressions and keyed-collection metadata after reconciliation.
This keeps repeated filter and replacement updates bounded instead of retaining one small reactive
graph per update.

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
blocking time, DOM size at semantic readiness, per-script decoded and executed bytes, function
inventory and invocation counts, and parse/compile/evaluation trace attribution. Executed bytes use
the most-specific V8 coverage range for each source interval, so an uncalled function body is not
hidden by its executed top-level script range and nested ranges are not counted twice.

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

For stage-16 candidates without a proposal-specific threshold, CPU or latency must improve its
target median by at least 10%, and retained or peak heap must improve by at least 15%. No
representative counter-metric median may regress by more than 3%, p95 by more than 5%, or compressed
emitted bytes by more than 1%. Correctness, cleanup, cancellation, security, and deterministic
output remain unconditional gates. The dominant `Mounted` experiment instead uses its explicit 5%
mixed-tree/keyed-workload, neutral-teardown, and at-most-10%-heap-growth gate.
