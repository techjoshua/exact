# JavaScript performance improvements

Status: gated exploratory investigation plan. Its measurement baseline and dependent-foundation
decisions are complete; its final optimization disposition remains a mandatory later stage in the
repository execution sequence. This document records a client/server performance audit,
directional measurements, and the work justified by them. It is not a commitment to V8-specific
behavior or permission to trade correctness and lifecycle ownership for benchmark results.

## Goal

Improve client startup and interaction latency, server rendering and request throughput, network
transfer, retained heap, allocation rate, and editor/build responsiveness while preserving:

- setup-once, inspectable component instances;
- behavior in non-V8 JavaScript engines;
- public own-property behavior unless deliberately changed;
- compact server wire formats; and
- lifecycle cleanup and ownership guarantees.

Heap is one first-class performance dimension, not the sole objective. A change that lowers
retained memory while increasing interaction latency, expands payloads to reduce CPU, or improves
one synthetic loop by moving work into startup is not automatically an improvement. Every delivery
must identify the user-visible metric it targets and report important counter-metrics.

Object layout is not intrinsically faster when it is more uniform. Extra
properties consume memory and can reduce cache locality. Every change therefore
needs workload and heap evidence rather than a hidden-class assertion alone.

The primary target is production application performance. Compiler language-service and artifact
host work are included because they execute in long-lived JavaScript editor/build processes. The
native compiler's Go CPU and heap are outside this proposal except where JavaScript IPC, scheduling,
or artifact consumption controls them.

## Repository execution role

This investigation participates in the sequential proposal program through three explicit gates;
it is not one undifferentiated optimization phase:

1. **Measurement baseline:** complete experiment 1 before new proposal implementation. A benchmark
   that does not reach its timed framework path is a failed test, not a performance result.
2. **Dependent foundations:** after enhancement and trust contracts, the structured-child decision,
   and internationalization and binding contracts settle or are explicitly deferred, resolve experiments 2–4 and 6 before lazy
   islands, structural refresh, resumption, or final adapter parity consumes their representations. Each successful experiment
   must either be implemented under a decision-complete owning proposal or become a focused proposal
   inserted before its first consumer. A rejected experiment must record the measured reason and the
   downstream proposals must retain an explicit generic fallback.
3. **Remaining optimization program:** after adapter parity, resolve experiment 5 and experiments
   7–13, land or separately propose successful changes, repeat whole-framework profiles, and record
   rejected options. Completion means every ranked experiment has a measured disposition; it does
   not mean forcing every hypothesis into the runtime.

Performance checks embedded in an intervening proposal remain part of that proposal's acceptance
criteria. They do not wait for the final optimization stage, and they may not silently introduce a
representation that an unresolved dependent-foundation experiment is intended to select.

The measurement-baseline gate was completed on 2026-08-05. The current contract, commands, scenario
coverage, failure behavior, and update policy are documented in
[`../performance.md`](../performance.md); the complete five-process Node and five-process Chromium
evidence is tracked in
[`../performance-baselines/javascript-framework.json`](../performance-baselines/javascript-framework.json).
Later performance stages must extend that suite when they introduce a new primary metric or
counter-metric rather than replace it with proposal-local timing loops.

The dependent-foundation gate was completed on 2026-08-05. Experiments 2–4 were accepted and split
into the ordered implementation proposals
[`compiler-owned-render-programs.md`](compiler-owned-render-programs.md),
[`bounded-deterministic-async-ssr.md`](bounded-deterministic-async-ssr.md), and
[`compact-hydration-publication.md`](compact-hydration-publication.md). Experiment 6 removed the
duplicate decoded request traversal and made independent artifact-file publication concurrent.
Binary native framing and additional artifact workers were rejected because measured JSON framing
was immaterial and native single-owned work dominated the profiled build path.

## Performance dimensions

Measure at least the dimensions affected by a candidate:

- **client startup:** transferred bytes, HTML and JavaScript parse time, module evaluation, mount,
  hydration, and time to first usable interaction;
- **client updates:** invalidation-to-paint latency, scheduler work, DOM reads/writes, long tasks,
  and frame-budget misses;
- **server rendering:** time to first byte, shell time, boundary reveal time, complete render time,
  CPU per request, and requests per second under bounded concurrency;
- **server operations:** request parsing, validation, dispatch, serialization, stream publication,
  and gateway overhead;
- **network:** uncompressed and compressed HTML, hydration, patch, state, catalog, JavaScript, and
  progressive-stream bytes;
- **memory:** peak and retained heap, allocation rate, garbage-collection frequency, and collection
  after teardown; and
- **development:** cold and incremental compile latency, HMR latency, language-tool response time,
  and JavaScript/native IPC cost.

### Overall opportunity ranking

| Rank | Opportunity                                                                  | Runtime      | Primary metrics                        | Expected help                   |
| ---: | ---------------------------------------------------------------------------- | ------------ | -------------------------------------- | ------------------------------- |
|    1 | Compiler-emitted DOM, hydration, and SSR render programs                     | Both         | Startup, update CPU, SSR throughput    | Very high                       |
|    2 | Bounded parallel rendering of compiler-proven independent async SSR siblings | Server       | TTFB, reveal and completion latency    | Very high for I/O-heavy pages   |
|    3 | Capability-split client runtime and broader safe lazy interaction islands    | Client       | Transfer, parse, evaluation, hydration | Very high                       |
|    4 | Lazy mounted ownership, static bindings, and a smaller component baseline    | Both         | Heap, mount CPU, GC                    | Very high                       |
|    5 | Incremental keyed-list deltas and linear reconciliation construction         | Client       | Update latency, frame budget           | High                            |
|    6 | Compact hydration manifests and compiler-guided adoption                     | Both         | HTML bytes, parse, hydration CPU       | High                            |
|    7 | Prewired compiler-known reactive dependencies                                | Client       | Invalidation and update CPU            | High                            |
|    8 | Traversal-scoped SSR disposal and request-wide output chunks                 | Server       | Peak heap, CPU, throughput             | Very high heap; high CPU        |
|    9 | Incremental enhancement target/root routing                                  | Client       | Structural update latency              | High for enhancement-heavy apps |
|   10 | Priority-bucket scheduling and root-level DOM commits                        | Client       | Burst latency, redundant work          | Medium–high                     |
|   11 | Single-pass transport validation/encoding and compact progressive streaming  | Both         | CPU, wire bytes, reveal latency        | Medium–high                     |
|   12 | Bounded tooling caches and lower-overhead compiler IPC/artifact emission     | Editor/build | Incremental latency, heap              | Medium–high                     |

## Heap-specific opportunity ranking

The rankings describe expected framework-wide leverage, not measured application savings. “Very
high” means an allocation scales with nearly every node or component, or that a lifetime change
reduces SSR retention complexity. “High” means a likely material reduction in the affected
workload. “Medium” is workload-specific or mainly reduces allocation and garbage-collection
pressure.

| Rank | Opportunity                                                                     | Runtime             | Expected help |
| ---: | ------------------------------------------------------------------------------- | ------------------- | ------------- |
|    1 | Replace full scopes on inert mounted nodes with lazy ownership                  | Client              | Very high     |
|    2 | Do not create reactive watchers for static DOM properties                       | Client              | Very high     |
|    3 | Lazily materialize component subsystems and share component methods             | Both                | Very high     |
|    4 | Dispose completed SSR component subtrees during traversal                       | Server              | Very high     |
|    5 | Compact committed mounted/VNode state and compiled cells                        | Both                | High          |
|    6 | Write SSR output through request-wide chunks instead of nested complete strings | Server              | High          |
|    7 | Allocate lifecycle cancellation controllers only when used                      | Client              | High          |
|    8 | Reduce keyed-list cache and reconciliation scratch allocation                   | Client              | Medium–high   |
|    9 | Store keyed-list SSR snapshots in one backing representation                    | Server              | Medium–high   |
|   10 | Bound JavaScript language-service snapshots and analysis caches                 | Editor/build server | Medium–high   |
|   11 | Lazily create SSR enhancement-planning state                                    | Server              | Medium        |
|   12 | Remove eager inspection, logging, and duplicate owner-registration state        | Both                | Low–medium    |

## Initial evidence

Measurements were taken on Node 24.11.1/V8 on Windows using
`--allow-natives-syntax` for map and fast-property inspection and
`--expose-gc` for directional allocation measurements. Synthetic loops used
250,000 renderer or VNode records and 50,000 component shells. These numbers
rank experiments; they are not release baselines.

### Component instances

Framework-created component instances report dictionary properties rather than
V8 fast properties. `createComponentInstance()` currently constructs a large
object literal containing public state, lifecycle collections, accessors, and
per-instance method closures.

A synthetic shell with the same broad structure compared as follows:

| Layout                                     | Approximate bytes per shell | Repeated read/call loop |
| ------------------------------------------ | --------------------------: | ----------------------: |
| Large object literal with own closures     |                     3,537 B |              190–242 ms |
| Class fields with shared prototype methods |                       872 B |                57–70 ms |

The absolute values include synthetic functions and are not expected to match
real components. The large and repeatable direction, together with the real
instance being in dictionary mode, justifies a production-shaped prototype.

Task registrations did not show the same problem. They retained fast properties
and a common map after ordinary startup, so eager padding or class conversion is
not currently justified for tasks.

### Mounted renderer records

A mixed DOM tree containing host nodes, text, a component, Fragment, Dynamic,
Portal, Activity, Suspense, and unsafe HTML produced seven `Mounted` maps. The
three common maps were:

- host: base fields plus `afterPlacement`;
- text/dynamic: base fields plus `stop` and `afterPlacement`; and
- component: base fields plus `instance` and `afterPlacement`.

Synthetic access across a representative distribution showed the tradeoff:

| Layout                                             | Approximate bytes per record | Repeated read loop |
| -------------------------------------------------- | ---------------------------: | -----------------: |
| Current sparse variants                            |                        106 B |         155–159 ms |
| Common hot header with remaining sparse variants   |                        138 B |         112–121 ms |
| Every optional `Mounted` field eagerly initialized |                        206 B |         118–123 ms |

Full padding is not worth pursuing: it nearly doubled record memory and was no
faster than the partial header. A narrow common header may be useful, but only
if real DOM mounting, patching, teardown, and retained-heap measurements justify
the added slots.

### VNodes

Ordinary, domain-bearing, and text VNodes currently use different maps, but all
retain V8 fast properties. A canonical five-field synthetic VNode used roughly
8 B more per VNode and did not improve the repeated read loop:

| Layout                         | Approximate bytes per VNode | Repeated read loop |
| ------------------------------ | --------------------------: | -----------------: |
| Current compact variants       |                        96 B |           22–30 ms |
| Canonical `key`/`domain` slots |                       104 B |           25–29 ms |

Canonical VNode padding should not proceed. It also changes observable
own-property behavior. The existing removal of delete-based JSX prop
normalization remains worthwhile because it avoids a transition without padding
the resulting VNode.

### Roots and server records

Renderer roots have several shapes, but they are few and long-lived. Server
patch and protocol objects often use conditional spreads, but many are
serialized once rather than repeatedly accessed hot records. Compact wire
objects should not be padded. These areas remain lower priority unless profiling
identifies a specific hot internal record.

### Current reactive and DOM benchmark evidence

A local Node 24.11.1 run of the existing 10,000-record reactive benchmark produced these directional
medians:

| Scenario                                                  |    Median | Raw payload |
| --------------------------------------------------------- | --------: | ----------: |
| Keyed identical refresh                                   |   2.11 ms |         â€” |
| Keyed one-item change with the benchmark's broad consumer | 105.00 ms |         â€” |
| Keyed one-percent change                                  | 106.48 ms |         â€” |
| Keyed rotation                                            | 129.19 ms |         â€” |
| Keyed add/delete                                          | 150.54 ms |         â€” |
| Keyed protocol roundtrip                                  |  39.09 ms | 1,181,837 B |

The identical keyed path is already fast. The next list gains should come from avoiding broad
downstream materialization, observation, reconciliation, and transport work rather than adding more
equality hashing. The protocol result is deliberately uncompressed but demonstrates that encoding,
validation, JSON, and metadata remain material work.

The existing `benchmark-dom-list.mjs` did not produce a usable measurement in the same run because
component construction failed before the timed update and left its captured instance undefined.
Repairing the benchmark and making it a compiled-browser benchmark is a prerequisite for accepting
DOM list claims. A performance gate that silently stops measuring the intended path is itself a
framework performance risk.

## Heap audit findings

### Mounted ownership and DOM bindings

The DOM renderer currently creates a complete effect scope before it knows whether a VNode owns
reactive work. Static text, ordinary intrinsic elements, fragments, markers, and compiled-cell
wrappers consequently receive scopes whose child, reaction, cleanup, and resume-waiter sets are
usually empty. Each scope also owns method closures and participates in the parent scope's child
set. A focused Node/V8 measurement of 50,000 empty framework scopes retained approximately 1,759 B
per scope. The number is directional, but the one-scope-per-mounted-node multiplier makes this the
largest client-only opportunity.

Use a lightweight ownership node for inert mounts and promote it only when the node registers a
reaction, cleanup, pause boundary, or transferable lifetime. Empty and singleton ownership
collections should avoid a `Set`; stable methods should be shared. The optimized representation
must preserve iterative subtree stop, Activity pause/resume, parked range transfer, enhancement
rerouting, adoption, and cleanup-error aggregation.

DOM property installation independently creates a watcher for every non-event property, including
literal attributes. Static styles additionally retain style-diff sets and maps. A focused
measurement retained approximately 723 B per no-dependency watcher. Compiler lowering should mark
static properties for one-shot installation. As a runtime backstop, a watcher whose initial run
records no dependencies may retire immediately because no dependency can schedule a later run.
Property-binding tables must not retain a no-op stop handle after that retirement.

### Component baseline

An otherwise empty component eagerly owns refs, list-controller maps, activity blockers, context
maps, five lifecycle arrays, a full effect scope, a log facade, an activation state machine, and a
task owner containing an `AbortController` and four sets. Most component API methods are closures
created in the instance object literal. A focused empty-component measurement retained
approximately 11,296 B per component; an isolated empty task owner retained approximately 1,375 B.
These values include V8 and benchmark-container overhead, but they confirm the component shell is a
first-order target rather than a cosmetic layout issue.

The class/shared-prototype experiment below should therefore include lazy first-use storage for
refs, lists, contexts, lifecycle handlers, activity blockers, task ownership, and inspection-only
token metadata. Compiler component contracts may eventually supply capability bits, but the basic
lazy representation must remain correct for dynamically reached APIs. Mount and activation
`AbortController`s should exist only when a registered handler can observe their signals.

Component inspection must remain coherent. Laziness may change an absent internal collection into
an empty inspected view, but it must not hide authored state, active tasks, resources, contexts, or
lifecycle ownership.

### Retained render representation

Each `Mounted` record retains both its authored/current VNode and a second mounted-child tree. For
many node kinds, `vnode.children` is redundant once children have mounted. Component props also
remain available through the component instance. Introduce a compact committed-node record that
retains only patch identity, current properties, domain, and node-kind-specific state; release
authored child arrays where they are no longer an ownership or resumption input.

Compiled cells currently add an outer VNode, a props object, a cell object, an empty child array,
and a fresh `Symbol` around the actual VNode. In a focused 100,000-record measurement, a compiled
cell retained approximately 536 B compared with approximately 344 B for a comparable ordinary
VNode, a directional overhead near 192 B per cell. Test direct branding or a compact compiler-owned
cell record while preserving stable identity, domain adoption, parking, hydration, and patching.
This is different from padding every VNode: canonical VNode padding remains rejected by the earlier
measurements.

Keyed lists also cache `{ item, vnode }` entries while the mounted renderer retains the committed
VNode. Prefer one renderer-owned keyed identity record where practical. Reconciliation should have
zero-, one-, all-unkeyed, and unchanged-order fast paths and allocate keyed maps, sets, LIS arrays,
and temporary `{ vnode, index }` records only when the input requires them.

### SSR lifetime and output buffering

The SSR owner retains every component instance in one strong set until the entire render or stream
finishes. Completed siblings therefore keep state, props, VNodes, scopes, contexts, task owners, and
resources alive while later subtrees render. Dispose a component after its output, resumption
capture, and owned asynchronous work have completed. Preserve a lightweight active stack for
failure cleanup. The normal target is peak live ownership proportional to render depth plus active
asynchronous boundaries, rather than total component count.

Synchronous and asynchronous string rendering build arrays of complete child strings and join them
at each nesting level. Use a request-wide bounded chunk writer or rope and join only at the final
`renderToString` boundary. Local buffering remains valid where a resumable boundary or output
extension requires an exact substring. Streaming must release completed component ownership even
when its bytes have already been published.

Keyed-list snapshots currently retain the wrapped HTML, inner HTML, and every item HTML. Store one
backing string with item offsets, materializing item substrings only at an API boundary. The generic
HTML differ similarly holds parsed trees, attribute maps, identity sets, source HTML, and patches
for both versions; compiler-planned structural refresh should allow it to become a compatibility
fallback rather than the normal large-boundary path.

SSR enhancement planning eagerly creates several weak maps and sets and may retain prepared
component children until final rendering. Allocate planning state only after an enhancement is
encountered, and release prepared records immediately after consumption. Enhancement-heavy SSR
benchmarks must measure planning and final rendering together.

### Language service and bounded diagnostics

The JavaScript language service retains snapshots, complete native analysis responses, and import
sets for every analyzed file. Keep unsaved overlays and compact dependency/diagnostic projections;
evict or reconstruct cold disk-backed source and rich analysis using a measured LRU policy. This
work must not weaken version fences, affected-file calculation, or editor responsiveness.

The default process-wide error context can retain arbitrary thrown object graphs until explicitly
cleared. Give global diagnostic/error retention a documented bound or host policy while preserving
application-owned error contexts that intentionally retain reports. DevTools and instrumentation
buffers must remain opt-in or bounded and must release sinks and generations immediately on
detach.

## Compiler-specialized rendering

Compiled JSX still creates generic cell-backed VNodes, after which the client renderer dispatches
on node kinds, installs generic property bindings, and reconciles generic child arrays. SSR walks
the same logical VNodes through its own generic dispatcher, and hydration reconstructs expected
VNode structure before comparing DOM.

Define one compiler-owned logical render plan with target-specific realizations:

- **client mount:** clone a static DOM template or execute direct construction instructions, then
  attach only the dynamic slots, ownership records, events, refs, and component boundaries;
- **client update:** address compiler-known text, property, style, branch, list, and component-prop
  slots directly instead of rediscovering their role from a generic VNode;
- **hydration:** advance a compiled DOM cursor over proven static structure and validate only the
  dynamic boundaries, form controls, ownership markers, and mismatch recovery points; and
- **SSR:** append pre-escaped static segments and evaluated dynamic values directly to the bounded
  request writer.

This is an internal execution representation, not a second public component model. Components
remain setup-once inspectable instances; runtime-authored/uncompiled VNodes, open dynamic children,
React compatibility, unsafe HTML, and unsupported shapes retain the generic path. Plans must carry
semantic ownership and source inspection identities without shipping rich compiler explanations to
the browser.

Prototype direct SSR writing first because it can prove output equivalence without DOM lifecycle
risk. Then prototype static client mount and compiled adoption on a deliberately narrow intrinsic
subset. Do not make template cloning a universal requirement: SVG/MathML namespaces, custom
elements, form defaults, `srcdoc`, raw HTML, and browser parser normalization need explicit
conformance.

## Server concurrency and streaming

Asynchronous SSR currently awaits rendered children in source order. Independent siblings waiting
on unrelated services therefore serialize their latency. Use the compiler placement/ownership graph
to identify subtrees that may start concurrently, with a configurable concurrency bound and
source-order publication.

Parallel execution must not race shared mutable SSR bookkeeping. Each candidate needs either an
isolated child render context or preallocated deterministic identity/marker ranges. Resource hints,
document-head contributions, enhancement planning, inspection events, cleanup failures, and output
limits must merge in deterministic source order. Parent contexts remain alive until every started
child settles, while traversal-scoped disposal releases each completed child as soon as its merged
output no longer needs it.

Measure CPU-bound and I/O-bound trees separately. Parallelism that improves one request while
collapsing process throughput or overwhelming an upstream service is a regression. Gates should
include time to shell, first reveal, complete render, requests per second, peak heap, cancellation,
and upstream concurrency.

Progressive replacement currently emits a complete inline range-location/replacement program for
each reveal. Install one nonce-bearing bootstrap helper per document and emit compact inert data or
short helper calls per boundary. The helper may maintain a bounded marker/range index instead of
creating a new tree walker for every replacement, and must relinquish ownership once hydration
takes over. Compare compressed bytes, browser script parse/evaluation, reveal latency, CSP behavior,
and inert-mode equivalence.

## Client startup, hydration, and lazy capability loading

The compiler should emit a per-root capability set so final bundlers can omit or defer task,
enhancement, Activity, Suspense, portal, refresh, resumption, inspection, and compatibility runtime
paths that the root cannot reach. Tree shaking remains useful, but capability-specific entry points
and source-linked bundle explanations make omission authoritative and diagnosable.

Broader lazy interaction islands are the principal code-deferral delivery. Dormant boundaries must
remain cheap enough that deferral does not replace module work with large runtime shells. Artifact
plans should emit preload hints only for likely activation generations and allow independent sibling
regions to load concurrently without serializing unrelated ownership.

Hydration boundary props currently live as independently escaped JSON attributes and are parsed and
validated per island. Prefer a document-level, versioned, size-bounded hydration table containing
shared strings/identities and indexed records; each boundary carries only its short record identity
and minimal activation attributes. Parse and validate the table once, then decode a record lazily
when its boundary activates. Preserve range-local recovery when one record is malformed rather than
invalidating every island.

Compiled adoption should avoid constructing expected child arrays, flattening fragments, and
building expected-attribute sets for every static node. A compact cursor can verify tag/namespace
and dynamic slots while trusting compiler/build identity for proven static attributes. Security and
hydration correctness still require validation at public/data boundaries; build identity is not
permission to trust user-mutated DOM blindly.

## Reactive updates, lists, scheduling, and DOM commits

### Prewired compiled dependencies

Proxy-based target/key tracking remains the general fallback, but the compiler already knows many
state write paths and expression consumers. Emit component-local dependency slot identities for
proven reads and writes so a write can invalidate its exact compiled consumers without weak-map
lookup or dependency discovery. Dynamic property access, aliases that cannot be proven, collections,
user-created reactive values, runtime JSX, and inspection retain normal tracking.

The fast path must preserve ordinary state observability and the same transaction, task,
optimistic-rollback, priority, and cleanup semantics. A slot identity is compiler-internal and
build-scoped; it is not public state identity or a transport operation.

### Keyed-list deltas

Reactive keyed reconciliation already computes changed key information, but the DOM list path still
materializes and plans the complete list. Carry a renderer-owned delta through the keyed collection
binding so known insertions, removals, moves, and changed items patch only their affected mounted
ranges. Unknown mutations and mismatched metadata fall back to full reconciliation.

Before the delta protocol, fix the current reverse patch construction that repeatedly prepends to
the result array. Preallocate by final length and assign by index. Add zero-, one-, unchanged-order,
all-unkeyed, append, prepend, truncate, and changed-key fast paths before allocating key maps or an
LIS. Preserve pointer capture, focus, DOM identity, Activity retention, enhancement boundaries,
portals, and cleanup ordering.

### Scheduler queues

There are only three work priorities, yet the scheduler repeatedly scans global maps for eligible
work, copies entries, and sorts selected batches. Prototype three insertion-ordered priority queues
with direct membership, priority promotion, and per-scope cancellation links. The target is work
proportional to queued/runnable entries without a full queue scan or sort per pass. Preserve
deduplication, captured task context, pause/resume, starvation protection, error aggregation, and
the runaway-generation limit.

### Root-level commits

Focus and selection preservation should occur once around a root transaction/commit rather than
around child reconciliation, prop iteration, and individual property watchers. The same commit can
coalesce repeated writes to one target, group detached insertions in a document fragment, refresh
component-root identity only after structural change, and schedule enhancement routing once after
the tree reaches a stable generation.

Trace logging must be genuinely lazy: hot paths should not describe DOM/VNode targets or allocate
detail objects when the logger rejects trace output. Component render duration should call
`performance.now()` only when a render handler or active profiler consumes it.

## Incremental enhancement and component-root routing

Enhancement reconciliation should maintain direct relationships from selector dependencies and
component output generations to affected boundaries. A normal patch unrelated to enhancement
selection must schedule no enhancement walk. When routing changes, reconsider only the dirty
boundary and its bounded root-bearing output frame rather than recursively search the entire mounted
root for a mismatched target.

Component root publication should likewise cache the active exported `_target` or first
root-bearing frame and update only on structural generation changes. Prop/text/style updates beneath
the same frame must not recursively rediscover the first host element.

The enhancements proposal owns the final routing semantics. This proposal owns measurement and the
requirement that the chosen representation supports localized invalidation rather than periodic
whole-root verification.

## Transport, validation, and build workflow

Server and hydration paths currently perform several combinations of JSON parse/stringify,
protocol encode/decode, graph safety validation, operation validation, and full-string UTF-8
encoding. Retain every security boundary while reducing duplicate traversal:

- validate and decode tagged protocol envelopes in one bounded traversal;
- specialize request/response validators from finite generated operation contracts;
- count output bytes while writing or encoding instead of encoding a completed string solely to
  measure it;
- use the most efficient platform byte-length primitive behind one portable helper;
- compact repeated protocol field names only through a versioned internal wire format with measured
  compressed as well as uncompressed results; and
- make gateways forward validated streams without parse/stringify translation when no policy or
  identity rewrite requires materialization.

HTTP compression is an adapter/deployment concern, but build and server outputs must expose correct
content types, cache policy, and deterministic artifacts so Brotli/gzip and immutable caching work.
Do not accept raw-byte growth on the assumption that repeated metadata will always compress away;
measure realistic headers and payloads.

For development, profile JavaScript/native compiler IPC, response JSON parsing, artifact graph
diffing, and multi-target emission independently from native analysis. Consider compact/binary
framing or shared-buffer records only when IPC is a measured critical path. Artifact variants whose
inputs are independent may emit concurrently under a bounded worker policy, while shared semantic
analysis and deterministic diagnostics remain single-owned.

## Cross-proposal constraints

The following active proposals, together with delivered foundations whose performance contracts
remain binding, must treat this plan as a constraint rather than wait for a later cleanup:

- **Enhancements as component composition:** `_`, `_target`, contribution layers, target routing,
  and unavailable enhancements must reuse ordinary component/mounted ownership. They must not add
  a permanent wrapper scope or duplicate target VNode tree per declared enhancement. Selector and
  root-generation changes must identify their affected boundary directly rather than require a
  scheduled whole-root routing walk after ordinary patches.
- **Cooperative structured children:** any selected design must reference the existing child and
  mounted structures rather than materialize a parallel graph. Opt-out components must allocate
  nothing, and participating components need measured retained-heap, traversal, branch-update, SSR,
  and hydration gates. Its structural facts should be reusable by compiled render/adoption plans.
- **Enhancement-first internationalization:** message descriptors, source fallback plans, locale
  data, catalogs, formatter caches, and descendant contributions must be artifact-split, bounded,
  shared by owner/locale, and released by generation. Inactive optional enhancements must not
  instantiate formatter/message ownership. Formatting slots should plug into compiled render plans,
  and locale changes should invalidate affected messages rather than rescan an application tree.
- **Component value/callback bindings:** lowering remains direct props plus one ordinary callback;
  it must not introduce binding/channel objects or a general runtime registry. Generated callbacks
  should use the same stable-cell and prewired-dependency strategy as equivalent explicit callbacks.
- **Lazy interaction islands:** dormant records, loader promises, captured event data, and failed
  generations must be bounded and promptly released. The memory saved by deferred code must not be
  replaced by large per-boundary runtime shells. It should consume the compact hydration table,
  capability-split runtime, and compiler adoption plan rather than preserve per-island JSON and a
  generic full-tree adoption pass.
- **Compiler-planned structural refresh:** compact plans should replace most full HTML parse trees
  and duplicated snapshots. Rich source explanation stays outside client contracts, and temporary
  plan/diff state is released after publication. Plans should share render-slot identities and
  keyed deltas with client updates rather than define a parallel mutation model.
- **Partial-prerender resumption:** checkpoints serialize compact identities, never live component
  or VNode graphs. Resumed request ownership must use traversal-scoped SSR disposal and release
  reconstructed generations deterministically. Resumed independent siblings may use the same
  bounded deterministic SSR concurrency contract.
- **Server component-library trust:** bundler authorization should make one package decision per
  graph generation and reuse it across target emission and HMR invalidation. It must not duplicate
  compiler placement analysis, retain stale generations, or add runtime checks to already-authorized
  artifacts.
- **Webpack, Bun, and microfrontend parity:** adapters should preserve capability splitting,
  hydration-table indexing, preload metadata, and the single progressive bootstrap helper. Gateways
  should stream or forward validated payloads without unnecessary parse/stringify cycles while
  retaining the same authoritative validation boundary.

These constraints do not make every performance experiment a functional prerequisite for every
proposal. They prevent those proposals from committing representations that make the
highest-ranked changes impossible, duplicate execution models, or merely move cost between heap,
CPU, startup, server concurrency, and wire size.

## Recommended experiments

### 1. Establish production-shaped measurement

Status: **completed on 2026-08-05.** The DOM-list benchmark now executes production-compiled
component code and reports construction/setup failure independently from timing. The opt-in
framework suite covers every category below in isolated Node processes and the current Playwright
Chromium build, records portable medians and tail samples, measures clean production builds, and
tracks raw/gzip/Brotli artifact and protocol sizes. See [`../performance.md`](../performance.md)
and the tracked baseline linked above.

The repaired DOM-list benchmark executes compiled component code and fails explicitly when
construction or capture does not reach the timed path. The opt-in performance suite measures:

- static and dynamic client mount, hydration, first interaction, and bundle/module evaluation;
- scalar, branch, keyed-list, enhancement reroute, Activity, and Suspense updates;
- synchronous, asynchronous, and progressive SSR under CPU-bound and I/O-bound workloads;
- operation request/response and streaming protocol throughput at representative payload sizes;
- creation and disposal of large component populations;
- retained heap after repeated component mount/unmount cycles;
- component API and state access through compiled application code;
- mixed-tree mount, patch, Activity park/unpark, and teardown;
- keyed-list workloads already covered by the DOM benchmark; and
- at least one current Chromium build in addition to Node.

V8 map inspection remains an optional diagnostic mode, while release evidence uses portable
elapsed-time and heap measurements. Medians are recorded across separate processes so optimized
state and garbage collection from one candidate do not contaminate another.

### 2. Prototype a compiler-owned render plan

Status: **accepted for a focused implementation proposal on 2026-08-05.** The first bounded
prototype writes the same static-intrinsic-plus-dynamic-text tree directly from compiler-shaped
slots while retaining the generic VNode renderer as the fallback. Five isolated Node 24.11.1
processes on Windows x64 measured 20 renders of a 500-row tree. Median render time fell from
11.35 ms to 0.51 ms (22.33x), and observed peak heap growth fell from 18,812,656 bytes to 1,976,152
bytes. Raw, gzip, and Brotli output remained exactly 16,327, 2,462, and 1,025 bytes.

This result accepts the internal render-program direction, not a universal renderer replacement.
The focused implementation must prove client template mounting, compiled hydration adoption,
namespaces, form state, custom elements, events, refs, mismatch recovery, Suspense, Activity,
enhancements, inspection, and target-specific fallback before broadening eligibility. The reusable
slot identity must precede lazy islands and structural refresh in the execution queue.

Start with direct bounded SSR writing for a static-intrinsic-plus-dynamic-text subset and compare
exact output, CPU, bytes, and peak heap against generic VNode SSR. Then reuse the same logical slots
for client template mounting and compiled hydration adoption. Expand only after namespace, form,
custom-element, event/ref, mismatch, Suspense, Activity, enhancement, and inspection contracts pass.

Accept a target-specific realization only when its plan is smaller or faster in representative
artifacts, its generic fallback is explicit, and no public component/VNode API depends on the
internal plan shape.

### 3. Prototype bounded deterministic async SSR concurrency

Status: **accepted for a focused implementation proposal on 2026-08-05.** Five isolated Node
24.11.1 processes rendered eight compiler-independent task-owning siblings with a 5 ms I/O delay.
Ordered concurrency four reduced median completion from 117.79 ms to 26.27 ms (4.49x), while
concurrency eight completed in 10.91 ms. Observed peak heap remained effectively flat: 707,744
bytes for serial rendering and 724,368 bytes at concurrency four. The same isolated-root prototype
improved the CPU-bound comparison from 62.34 ms to 60.01 ms, and four concurrent requests completed
in 124.69 ms versus 499.06 ms when deliberately serialized. Exact
HTML and raw/gzip/Brotli bytes were unchanged.

The implementation must consume compiler-proven independence rather than parallelize arbitrary
children. It must reserve deterministic identity ranges, merge output and resource hints in source
order, isolate mutable traversal state, bound upstream work, cancel sibling work after failure, and
dispose every completed or abandoned owner. Concurrency remains configurable and defaults to a
bounded server policy; the serial path remains the fallback for unproven relationships and
concurrency one.

Measure serial rendering against compiler-proven independent sibling groups with concurrency 1, 2,
4, and 8. Test isolated child contexts or deterministic identity-range reservation, ordered output
merge, resource hints, cleanup, cancellation, upstream limits, and concurrent requests. Accept only
if I/O-heavy latency improves materially without an unacceptable CPU-bound throughput or heap
regression.

### 4. Prototype compact hydration and progressive publication

Status: **accepted for a focused implementation proposal on 2026-08-05.** The accepted hydration
shape groups boundaries by compiler-known component and finite prop schema, stores compact value
rows in one indexed table, and leaves unsupported or open-ended prop shapes on the existing
attribute representation. A naive object-record table was rejected because it increased compressed
bytes. Across five isolated Node 24.11.1 processes, 200 representative boundaries fell from 49,893
to 19,432 raw bytes, 2,702 to 2,649 gzip bytes, and 1,449 to 1,365 Brotli bytes. Median parse and
record reconstruction fell from 9.89 ms to 8.44 ms.

A single progressive replacement helper plus 32 ordered calls reduced 19,692 raw bytes to 2,736,
661 gzip bytes to 594, and 448 Brotli bytes to 426. Median JSDOM parse/execution fell from 9.33 ms
to 8.00 ms. The implementation must retain CSP nonces, inert mode, range-local marker lookup,
hydration ownership transfer, malformed-record isolation, early interaction, form state, and a
per-boundary fallback. The helper is installed at most once per response and never claims a root
already marked hydrated.

Compare per-boundary JSON attributes with one indexed hydration table under eager and lazy islands,
including compressed HTML, parse/validation time, range-local corruption, and activation latency.
Compare generic static adoption with a compiled cursor. Separately install one progressive helper
and measure repeated reveal bytes and execution against the current per-reveal inline program.

### 5. Prototype reactive, list, scheduler, and DOM fast paths

Land the linear result-array construction and low-risk reconciliation fast paths before designing a
keyed delta contract. Measure mutation-to-paint in a real browser with one changed item, sparse
changes, rotation, append/prepend, and full replacement. Prototype prewired component-local
dependency slots independently from keyed deltas.

Replace scheduler scans/sorts and root focus/commit nesting in separate experiments. Each must
retain priority, starvation, task-context, transaction, error, focus, pointer-capture, and cleanup
tests so benchmark gains remain attributable.

### 6. Prototype fused transport and build-host work

Status: **implemented where accepted and otherwise resolved on 2026-08-05.** Five isolated Node 24.11.1
processes showed that encoded and decoded graph validation consumed about 85% of the representative
request pipeline. The second decoded traversal duplicated the stronger bound already established by
strict encoded-JSON validation and safe reactive-envelope reconstruction. Removing it reduced the
2,000-request microbenchmark from 192.72 ms to 108.24 ms (1.79x). Five hundred over-depth requests
were rejected in 30.63 ms median (about 0.06 ms each). The production-shaped
`server.operation-request` workload subsequently improved from the tracked 6.73 ms median to
5.88 ms for 100 requests (12.7%) with identical response bytes. Accessor, prototype, depth, node,
byte, finite-number, and malformed-envelope rejection remain covered at the authoritative parser.

Build-host profiling attributes 6.31 ms of an 8.10 ms paired-artifact sample to native requests and
1.90 ms to JavaScript host/emission work. Concurrent publication of already-settled independent
client, server, shared, and source-map files reduced host time from the 2.65 ms prototype baseline
to 1.90 ms (28.3%) and total time from 9.98 ms to 8.10 ms (18.8%). Request JSON encoding plus
response JSON decoding measured about 0.05 ms against a 1.79 ms native request, so binary framing is
rejected until a larger real workload shows IPC serialization as a material target. Additional
artifact workers are likewise rejected for now: native semantic work is single-owned and dominates
the measured path, while safe independent output publication is already concurrent.

Instrument parse, encoded validation, decode, decoded validation, operation validation, extension,
encode, stringify, byte count, and stream emission separately. Fuse only confirmed duplicate
passes. Record compressed and uncompressed bytes and adversarial validation latency. Profile native
compiler IPC and artifact emission separately before selecting binary framing or parallel workers.

### 7. Prototype a class-backed component instance

Status: **implemented and accepted on 2026-08-06.** The component instance, logger, ref bindings,
ref registry, and task-owner record now use shared prototype methods. Optional lifecycle arrays,
context maps, refs, list-controller storage, activity blockers, task-controller state, and task
settlement sets are materialized only when used. Mount and activation abort controllers are also
deferred until the corresponding lifecycle phase has registered handlers.

Five isolated Node 24.11.1 processes each retained 50,000 empty component instances. Median
retained heap fell from 12,985.06 bytes to 6,712.19 bytes per instance, a 48.3% reduction. Median
construction-plus-collection time fell from 791.47 ms to 566.91 ms, a 28.4% reduction. These are
focused component-shell measurements rather than whole-application memory claims; representative
DOM and lifecycle suites remain the acceptance guard for behavioral and update regressions.

The production-compiled DOM fixtures also improved against the checked-in Windows baseline:
static mounting fell from 38.98 ms to 33.02 ms median (15.3%), while the mixed-tree lifecycle
fixture fell from 28.41 ms to 22.95 ms for mounting (19.2%) and from 11.28 ms to 6.76 ms for
teardown (40.1%). Five measured processes followed two warmups for each fixture. These directional
results clear the experiment's acceptance thresholds without replacing the broader regression
suite or future cross-platform measurements.

Replace the large object-literal construction internally with a
`ComponentInstanceImpl` class or equivalent shared prototype:

- keep state, props, contexts, tasks, lifecycle collections, ownership, and
  cancellation visible as coherent instance fields;
- move stable component API methods and accessors to the prototype;
- move current closure locals into explicit instance fields or one inspectable
  internal lifecycle record;
- retain per-instance callable values only where the API requires them, such as
  the task facet and component logger;
- preserve setup-once component invocation with the instance as `this`; and
- decide explicitly whether extracting an unbound method is supported before
  changing the current closure-method behavior.

Proceed to implementation only if the production-shaped prototype:

- keeps component instances in fast-property mode on supported V8 versions;
- reduces component-population retained heap by at least 20%;
- improves component creation/lifecycle workload median by at least 10%; and
- does not regress representative DOM update workloads by more than 3%.

This is the highest-priority component experiment, after establishing the node-scope and static
property baselines below.

### 8. Prototype only a dominant `Mounted` header

Do not initialize every optional field. Test a renderer-owned constructor that
gives the dominant host, text/dynamic, and component records the same ordered
header, initially limited to:

- `vnode`;
- `dom`;
- `scope`;
- `children`;
- `instance`;
- `stop`; and
- `afterPlacement`.

Range ends, portals, raw nodes, Activity, and Suspense state should remain
variant-specific or move behind an explicit variant record only when that
reduces total memory. Compare this with an alternative that keeps the current
compact records but splits generic teardown and placement paths by mounted kind,
allowing each hot function to see fewer maps.

Accept a layout only if mixed-tree and keyed-list benchmarks improve by at least
5%, teardown improves or remains neutral, and retained heap grows by no more
than 10%. Prefer specialized code paths over extra per-node slots when their
performance is comparable.

### 9. Prototype lazy mounted ownership and static property installation

Compare the current full scope with a lightweight ownership node that promotes on first reactive
registration. Separately add a compiler-known static property path and no-dependency watcher
retirement. Measure static trees, reactive property trees, Activity pause/resume, adoption,
enhancement rerouting, and repeated mount/unmount. These changes may land independently, but their
combined retained heap must also be measured because one static element currently owns both costs.

Accept each change only if it preserves cleanup and update semantics, produces a stable heap plateau
after repeated teardown, and materially reduces retained heap in its target population without a
material reactive-update regression.

### 10. Prototype traversal-scoped SSR ownership and chunked output

First make completed component instances disposable during synchronous rendering while preserving
reverse child-before-parent teardown. Extend the same lifetime to asynchronous rendering and
streaming only after Suspense, task settlement, resumption capture, cleanup failure, and aborted
stream tests pass. Measure peak heap against wide and deep trees separately.

Build the request-wide chunk writer as a separate experiment so ownership savings and string-copy
savings remain attributable and independently revertible. Include `renderToString`, asynchronous
rendering, streaming, output extensions, resumable boundaries, and configured byte-limit failures.

### 11. Prototype compact cells, list state, and snapshots

Test cell branding or compact records without canonical VNode padding. Add reconciliation fast
paths before replacing the keyed cache representation, then measure stable lists, append/prepend,
reorder, item replacement, and Activity-retained lists. For SSR snapshots, compare the existing
three-level string representation with one backing string plus offsets and include downstream patch
generation costs.

### 12. Bound tooling and diagnostic retention

Add language-service telemetry for snapshot, analysis, and import-cache entry counts and estimated
source bytes. Prototype eviction only with editor latency and affected-file correctness tests. Add
explicit bounds to framework-owned global diagnostic buffers; application-owned histories remain
under application policy.

### 13. Stop unless profiling finds another target

Do not currently:

- canonicalize or pad VNodes;
- convert or pad task registrations;
- normalize the shapes of renderer roots;
- pad serialized server protocol or patch objects; or
- build a second operation-batching or server-concurrency subsystem where the existing bounded
  action path already provides the required behavior;
- replace the generic renderer universally before a compiler plan proves a supported subset and an
  explicit fallback;
- optimize keyed equality further without a profile showing it dominates downstream update work;
- accept extra hydration, protocol, or progressive-stream bytes merely because HTTP compression may
  reduce them; or
- change public record layouts solely to satisfy `%HaveSameMap`.

After the ranked experiments, repeat whole-framework profiles. Further layout work should require a
named hot call site or retained ownership path and evidence that its benefit exceeds its added
complexity.

## Test and rollout requirements

The component prototype must retain lifecycle ordering, error handling, task
ownership, context lookup, refs, reparenting, Activity transitions, resumption,
and construction-failure cleanup tests. Add a repeated mount/unmount heap
plateau test without asserting engine-specific byte counts.

The `Mounted` experiment must retain semantic DOM identity, portal ownership,
retained Activity ranges, Suspense candidates, refs, direct and delegated event
cleanup, unsafe HTML teardown, hydration adoption, and deep iterative teardown.

SSR tests must prove completed siblings are collectible without invalidating parent contexts,
resumption capture, pending task observation, Suspense publication, or cleanup ordering. String
writer tests must enforce byte limits incrementally and compare exact public output.

Static binding tests must distinguish literal, computed-but-untracked, reactive, style, URL,
property, and attribute behavior. Scope tests must cover transfer, pause/resume, deep iterative stop,
cleanup registration during teardown, and scheduler work removal.

Render-plan tests compare semantic DOM, lifecycle, SSR bytes, hydration outcome, mismatch recovery,
inspection identity, and generic fallback rather than snapshotting incidental generated source.
Async SSR tests cover deterministic IDs/output, bounded upstream concurrency, parent context
lifetime, sibling failure, cancellation, resource-hint ordering, and throughput under concurrent
requests.

Hydration and progressive-stream tests record compressed/uncompressed bytes and protect CSP nonce,
form state, early interaction, malformed-record isolation, server-slot ownership, lazy activation,
and transfer from progressive helper to hydrated ownership. Protocol optimizations retain
adversarial depth/node/byte/cycle/prototype tests and must fail closed at the same boundary.

Performance gates use medians and tail latency from isolated processes or browser contexts. They
must identify benchmark setup failure separately from a slow result and record enough environment
metadata to compare runs. No test asserts one engine's exact byte count, hidden class, JIT tier, or
garbage-collection schedule.

Land experiments separately. Each implementation change should contain focused benchmark evidence
so it can be reverted independently if a future engine or workload changes the tradeoff.
