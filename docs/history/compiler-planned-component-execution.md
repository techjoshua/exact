# Compiler-planned component execution

## Status

Implemented after
[`bounded-deterministic-async-ssr.md`](bounded-deterministic-async-ssr.md) and
[`compact-hydration-publication.md`](compact-hydration-publication.md). The native
compiler now emits one canonical component execution subgraph and target-specific projections.
The core runtime instantiates availability-aware dependency watchers and generation-bound output
slots on each durable component instance. Async SSR wires reachable compiled children before it
drains their work and schedules root task generations through the request-wide bounded scheduler.

Implementation deliberately keeps structural child calls and render consumers in the existing
compiled render program. Duplicating them into a second runtime graph would add a planner and two
sources of reachability truth. The execution contract therefore contains only the information the
ordinary component/task runtime did not already have: indexed value ports, continuation
transitions, and reactive-allocation decisions. Static, conditional, keyed, registry, lazy, and
recursive child selection retain their established render-program ownership and automatically
instantiate the selected child's attached local subgraph.

## Decision

Compile every native eXact component into one canonical component-plan intermediate
representation. Generate executable server and client facets, linking metadata, validation
contracts, and inspection artifacts from that same representation.

Each compiled component contributes a generated target render function rather than one expanded
application tree. The compiler lowers dependency wiring directly into that function. Invoking its
server form creates local slots, connects continuations and render regions, invokes every currently
reachable child with slot-backed inputs, and offers every ready continuation to the shared request
scheduler. No server-side planner first flattens or composes a root graph.

Continuations are stateless transitions over explicit input and output slots. Stateful values,
ownership, cancellation, and generation reside in the instantiated execution frame. A continuation
may begin as soon as its component instance is reachable, its control gate is active, and all of its
input slots are available. Its validated outputs can satisfy other continuations, child props, and
render regions without waiting for recursive component rendering to discover those consumers.

Every authored continuation invocation owns one dependency watcher. A continuation definition by
itself never creates a watcher or executes work. Setup invocation, an active structural branch, or
an explicit interaction supplies the activation root.

Server rendering and client-only rendering use the same semantic plan with different executable
facets and allocation strategies. Server execution favors compact request-owned slots and bounded
publication. Client execution retains durable component instances and allocates reactive
primitives only where identity, shared computation, equality, asynchronous consumption, or
structural invalidation requires them.

The compiler binary remains a build-time dependency. Production runtimes execute generated
JavaScript and compact plan records; they do not analyze source or invoke the compiler.

## Model

The design separates four lifetimes:

| Lifetime                    | Owner                                  | Purpose                                                                                 |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| Component-plan IR           | Compiler session                       | Canonical semantics from which every executable and descriptive artifact is derived.    |
| Compiled component function | Build generation                       | Target executable containing local ports, gates, transitions, regions, and child calls. |
| Execution frame             | SSR request or durable client instance | Concrete values, node states, generations, ownership, cancellation, and staged effects. |
| Transition invocation       | Component or task generation           | One exactly-once execution of a stateless continuation against validated slots.         |

A component-type tree and a request execution graph are not the same structure. Component plans
retain logical ownership and child composition. Instantiated continuation and render dependencies
form a directed acyclic graph for one generation: several consumers may share one output, and one
consumer may await several producers.

Reactive invalidation does not create a cycle inside a generation. It fences or cancels obsolete
work and creates a new generation with new concrete slot versions.

## Canonical compiled component

The private canonical compiler IR is:

```ts
type ComponentExecution = {
	readonly version: 1;
	readonly ports: readonly ComponentPort[];
	readonly transitions: readonly ComponentTransition[];
	readonly reactive: readonly ReactiveAllocation[];
};

type ComponentPort = {
	readonly index: number;
	readonly kind: 'state' | 'props' | 'derived' | 'argument' | 'context';
	readonly path: string;
	readonly direction: 'input' | 'output' | 'inout';
};

type ComponentTransition = {
	readonly id: OpaqueOperationId;
	readonly taskId: OpaqueTaskId;
	readonly activation: 'setup' | 'interaction';
	readonly placement: 'server' | 'client' | 'isomorphic';
	readonly readiness: 'blocking' | 'nonblocking';
	readonly concurrency: 'parallel' | 'latest' | 'queue';
	readonly inputs: readonly number[];
	readonly outputs: readonly number[];
};
```

- A server-only component may emit only a server facet.
- A client-only component emits no initial server transition or server render node.
- An isomorphic component may emit specialized server and client facets from the same semantic IR.
- A distributed component may emit a client machine plus one server facet containing initial
  server-render transitions and later interaction-triggered executors.
- A selected dynamic child brings its own target-matched attached contract. A client-only
  component has no server transition projection and cannot start server work merely by existing.

The compiler must not clone semantic decisions independently into these facets. Slot provenance,
placement, reachability, effects, and ownership are decided in the canonical IR and projected into
each environment-specific artifact.

The target-neutral structure exists inside compiler analysis. Emission projects out transitions
for the opposite environment, compacts the remaining port indexes, and attaches only that local
projection to the matching generated component export. It is never emitted as a combined
server/client runtime object.

## Physical artifacts and minimal exports

Component plans are semantic units; physical files remain module or bundler-chunk units. One source
or generated module may contain several native components. The compiler emits separate target
projections of that module rather than forcing one file per component. A representative private
build layout is:

```text
.exact/catalog.exact.server.js  # Every server-relevant component from catalog.tsx
.exact/catalog.exact.client.js  # Every client-relevant component from catalog.tsx
```

Only target projections required by at least one component in the module are emitted. Within a
projection, each component retains its own opaque component identity and attached contract. A
server-only component is absent from the client projection; a client-only component with no server
descendants or server tasks is absent from the server projection. Unexported local components may
remain local bindings when reachable from another component in that projection. These generated
paths are private artifact identities, not authored or stable public package subpaths.

Each authored or compiler-required component export is still the smallest cohesive target-owned
value. One generated file can export several such values:

```ts
// catalog.exact.server.js
const productCardContract = {
	plan: /* component-local SSR plan */,
	executors: /* initial and interaction-triggered server continuations */
};
export const ProductCard = /* @__PURE__ */ attachExactServerContract(
	productCardServerRender,
	productCardContract
);

const priceBadgeContract = {
	plan: /* a different component-local plan */,
	executors: /* this component's server continuations */
};
export const PriceBadge = /* @__PURE__ */ attachExactServerContract(
	priceBadgeServerRender,
	priceBadgeContract
);

// catalog.exact.client.js may likewise export ProductCard, PriceBadge, and other client facets.
```

The private contract attached to the server component export is the authority-bearing unit. It
contains the component-local SSR plan, server render programs, continuation executors, ownership,
and validation records needed whenever that component is selected. A continuation used by both
initial SSR and later client invocation has one attached implementation.

Keeping the contract on the server render/component value is important for dynamically invoked
content. Loading a route, lazy component, finite registry member, microfrontend exposure, or
recursive child brings its matching plan and executors with the same canonical component identity.
The runtime reads and validates that contract before invoking the newly reachable generated server
render function; it does not consult a separately maintained executor table that can drift from the
rendered value.

The attachment is private and non-enumerable. Generated attachment construction must be removable
as a pure unused export when the authored module has no required evaluation side effects. The
compiler preserves allowed authored module initializers and side-effect imports under ordinary ESM
semantics; it does not promise to tree-shake an effectful source module. Application code and public
component-library barrels continue to export ordinary component values. The compiler may place
unusually large executors in private lazy chunks referenced by the attached contract, but those
loaders remain authorized parts of the same server component contract.

The compiler may split an unusually large lazy facet into more chunks. One facet must not import
another merely to share generated helpers. Common runtime behavior belongs in narrow
framework-runtime modules; component-specific constants may be duplicated when that preserves
artifact isolation and avoids a cross-target dependency.

Authored ESM barrels remain a supported and idiomatic component-library surface:

```ts
export { Button } from './Button.js';
export { Dialog } from './Dialog.js';
export { DataGrid } from './DataGrid.js';
```

Application authors may import those components from the package barrel. The compiler and build
adapter resolve each exported symbol to its canonical component identity and selected physical
facet; authors do not need target-specific application imports.

Precompiled libraries may also publish or generate target-specific facet barrels when that is the
most convenient bundler integration:

```text
<library>/server.js    -> named exports of server facet modules only
<library>/client.js    -> named exports of client facet modules only
```

These barrels must be side-effect-free, retain named ESM exports, and avoid eagerly registering
every re-export at module evaluation. This lets Rollup, Vite, Webpack, Bun, and other conforming
bundlers remove unused library components through ordinary export reachability. A mixed runtime
barrel that imports server and client implementations together remains forbidden because it
defeats target isolation; the public authored barrel itself is not forbidden.

Root entry modules make reachability explicit to ordinary bundlers:

```text
<page>.ssr.js       -> reachable server.js modules
<page>.client.js    -> reachable client.js modules
<host>.dispatch.js  -> authorized operation-to-server-component loader index
```

A client dispatch stub contains only opaque operation and transport information. It never imports
the corresponding `server.js` component. The generated host dispatch entry is where the server
endpoint composes its immutable build/root allowlist. For an eager component it may retain the
attached contract directly. For authorized dynamic content it retains an opaque operation-to-loader
record and loads the matching `server.js` module on demand before reading its attached executor.
The browser never supplies a module path, export name, or component name.

Endpoint authority must not depend on one particular process having rendered the component first.
The build/root loader index is sufficient to reacquire the attached contract in serverless,
multi-process, restarted, and separately scaled executor hosts. Observing a dynamic component during
SSR may warm a runtime cache, but it does not create authority that was absent from the authorized
build graph.

Static child edges use target-matched private module references. Registry and lazy edges preserve
their existing dynamic-import and chunk boundaries. Build adapters may replace those references
with virtual modules or native manifest entries, but must preserve the same one-way target
reachability.

Inspection and source-rich linker facts are separate non-runtime build products. Production facet
modules contain only the compact facts required to execute and validate that facet. This prevents
debug metadata from retaining executors or application modules.

## Ports, slots, and stateless transitions

Component inputs are explicit ports for constants, props, context values, state generations,
derived results, invocation arguments, and predecessor outputs. Server-resident context capabilities
are resolved by opaque token through the host and are never serialized merely to fill a slot.

An internal component call may receive an unresolved slot handle instead of forcing the parent to
await a concrete prop value. Authored component code still sees its declared value after readiness;
the handle exists only inside the generated server function. Conceptually:

```ts
type ServerInput<T> = T | ServerSlot<T>;

function ProductPageServer(
	request: ServerRenderContext,
	inputs: { productId: ServerInput<string> }
): ServerRenderHandle {
	const frame = request.openComponent(productPageContract, inputs);
	const product = frame.output<Product>('product');

	frame.issue(loadProduct, [frame.input('productId'), frame.context(ProductRepository)], product);
	frame.child(ProductDetailsServer, { product });

	return frame.region(productPageRenderProgram, [product]);
}
```

`frame.issue()` increments no global planning phase. It records local consumers on its input slots
and immediately queues the continuation when every input is available. `frame.child()` synchronously
invokes a statically reachable child even when one of its generated inputs is unresolved, allowing
that child to wire independent work immediately. `frame.region()` returns a render handle that
becomes executable when its declared slots settle.

## Dependency watchers

Constants, reactive values, contexts, component inputs, structural selectors, and continuation
outputs implement one internal dependency-source contract:

```ts
type DependencySnapshot<T> =
	| { readonly status: 'pending'; readonly generation: number; readonly version: number }
	| {
			readonly status: 'available';
			readonly generation: number;
			readonly version: number;
			readonly value: T;
	  }
	| { readonly status: 'failed'; readonly generation: number; readonly version: number }
	| { readonly status: 'cancelled'; readonly generation: number; readonly version: number };

type ContinuationDependencySource<T> = {
	read(): DependencySnapshot<T>;
	subscribe(notify: () => void): Disposable;
};
```

Readiness is separate from value. An available `undefined` is a legitimate value; an initially
pending predecessor slot is not. Constants are immutable sources available at watcher construction.
Ordinary reactive values are available sources whose version advances on effective publication.
Continuation output slots begin pending and become available only after their owning generation
successfully validates and commits.

When an upstream continuation issues a new generation, its generation-bound output slots become
pending for that generation before downstream watchers can snapshot them. A previously committed
value may remain visible as retained UI, task status, or inspection data, but it is not an available
input for work that requires the new generation. This prevents a downstream continuation from
combining new upstream inputs with an old predecessor result.

One continuation invocation creates a watcher conceptually equivalent to:

```ts
type ContinuationDependencyWatcher = {
	readonly sources: readonly ContinuationDependencySource<unknown>[];
	readonly gate: ContinuationDependencySource<boolean>;
	readonly owner: ComponentExecutionOwner;
	readonly policy: TaskConcurrencyPolicy;
	readonly lastIssuedVersions: readonly number[];
};
```

The implementation may use compact readiness bits, remaining counts, and version arrays instead of
allocating one object per source. Its semantic rules are:

1. Subscribe to every source and gate under the component owner.
2. Do not issue while the gate is inactive or any dependency is pending.
3. After all dependencies are available, take one atomic value/version snapshot and issue the
   initial generation.
4. After effective source publication, issue at most one new generation for the resulting version
   vector. Several dependencies changed in one reactive transaction produce one invocation, not
   several intermediate invocations.
5. Pass the captured snapshot to the stateless continuation. Values do not change underneath an
   executing generation.
6. Apply the authored `parallel`, `latest`, `queue`, and keyed-lane policy through the existing task
   runtime. In particular, `latest` cancels a superseded generation and every policy fences stale
   settlement.
7. Publish successful staged outputs as one transaction. Output-slot publication then notifies
   downstream continuation, child-input, gate, and render-region watchers.
8. If a source fails, do not invoke its dependent watcher. Route the failure once through the
   source generation's component error/Suspense ownership, cancel dependent work for that
   generation, and release the corresponding fallback or failed settlement. A blocked region must
   not wait indefinitely for an output that cannot arrive.
9. Superseding cancellation advances the output to the replacement generation's pending state.
   Terminal cancellation closes the affected generation, cancels dependent work, and settles its
   structural owner under the existing cancellation policy.
10. When a branch withdraws, a key is replaced, a component unmounts, or a request ends, dispose its
    watchers and cancel their owned generations.

The watcher is the local scheduling primitive. `frame.issue()` is compiler-generated construction
of this watcher, not an imperative promise to run immediately. A ready constant-only watcher issues
during component construction; a watcher depending on an empty reactive slot remains dormant until
that slot publishes.

Explicit interaction tasks use the same generation runtime but do not automatically execute merely
because their argument sources change. The interaction is an activation source. A setup-owned task
invocation is reactive and therefore creates the automatically reissuing watcher described above.

One server transition is conceptually:

```ts
type ServerTransitionNode = {
	readonly id: OpaqueOperationId;
	readonly owner: OpaqueComponentPlanId;
	readonly gate: OpaqueReachabilityGate;
	readonly inputs: readonly SlotIndex[];
	readonly outputs: readonly SlotIndex[];
	readonly executor: OpaqueExecutorIndex;
	readonly readiness: 'blocking' | 'nonblocking';
	readonly concurrency: TaskConcurrencyPolicy;
};
```

Generated executors receive an owned frame and indexed inputs instead of recovering state through
application closures:

```ts
type StatelessServerTransition = (
	frame: ServerComponentExecutionFrame,
	task: TaskContext
) => void | Promise<void>;
```

The executor stages only compiler-authorized output slots, context effects, mutations, and render
effects. Settlement validates and publishes those outputs after generation and cancellation checks.
Downstream adjacency indexes make the new values available to waiting transitions and render
regions. The continuation code is stateless; the frame is not.

An output-to-input edge is a compiler-owned slot connection, not a source property path exposed as
protocol identity. Rich explanations and source ranges remain in private inspection artifacts.
Production records use compact indexes and build-scoped opaque IDs.

## Reactive-use and allocation planning

The compiler already elides a safe setup-derived cell when it has one eager consumer and does not
introduce observable identity. Component planning extends that analysis across component props,
forwarding components, render regions, tasks, and server/client facets.

Each producer records why and how its value is consumed:

```ts
type ReactiveUsePlan = {
	readonly producer: OpaqueProducerId;
	readonly consumers: readonly OpaqueConsumerId[];
	readonly mode:
		| 'constant'
		| 'snapshot'
		| 'live-slot'
		| 'reactive-identity'
		| 'derived'
		| 'structural';
	readonly lifetime: 'component' | 'branch' | 'item' | 'invocation';
	readonly placement: 'server' | 'client' | 'cross-runtime';
	readonly equalityBarrier: boolean;
};
```

The selected mode has concrete allocation meaning:

| Mode                | Generated behavior                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `constant`          | Store once or inline into its sole consumer.                                                        |
| `snapshot`          | Sample once without subscribing.                                                                    |
| `live-slot`         | Connect the existing producer to consumers without allocating another observable reactive identity. |
| `reactive-identity` | Preserve the same explicitly authored `ReactiveValue` or other identity-bearing value.              |
| `derived`           | Retain one shared calculation and equality barrier for several consumers or non-view work.          |
| `structural`        | Retain a generation-owned gate, key, list, or component-selection dependency.                       |

A prop used only to forward an existing producer may become a component port connection:

```text
Parent producer -> Wrapper input -> Child input -> render consumer
```

The generated path may connect the producer directly to the final consumer while retaining the
wrapper's logical component ownership and inspectable prop provenance. It must not expose a writable
parent-state proxy to the child. Ordinary props remain parent-owned readonly inputs; a child-edge
subscription is released with the child.

The optimizer must retain a primitive when identity is observable, a fresh object or collection
must remain stable, equality intentionally stops propagation, a task or event needs a durable
current value, or a branch/list lifetime needs generation fencing. Explicit `this.reactive()` is a
request for first-class identity and is never silently fused away.

Across a server/client boundary, object identity cannot be forwarded. A cross-runtime slot uses its
existing validated snapshot, delta, context lookup, or opaque-identity transport policy and becomes
a client-owned value after adoption.

## Dependency-aware child invocation

Each authored child component position emits an edge rather than requiring a renderer to discover
the child by executing JSX:

```ts
type ChildPlanEdge = {
	readonly slot: OpaqueChildSlotId;
	readonly component:
		| { readonly kind: 'static'; readonly plan: OpaqueComponentPlanId }
		| {
				readonly kind: 'registry';
				readonly selector: SlotIndex;
				readonly plans: readonly OpaqueComponentPlanId[];
		  }
		| { readonly kind: 'lazy'; readonly loader: OpaqueAuthorizedPlanLoaderId };
	readonly props: readonly SlotConnection[];
	readonly gate: OpaqueReachabilityGate;
	readonly key?: SlotIndex;
};
```

The compiler lowers each edge directly into the owning generated render function. Calling the root
therefore performs a synchronous dependency traversal through every child whose component identity
and reachability are already known. That traversal creates ownership and dependency subscriptions;
it does not await continuations or render blocked DOM regions.

At execution time:

- statically reachable child programs are invoked immediately;
- a conditional edge attaches only after its selector chooses the active branch;
- a finite registry attaches only its selected compiler-owned plan;
- a keyed list invokes one generation-scoped child program per available key and item;
- a lazy edge loads through its existing authorization, artifact, and stale-generation contract;
- recursion invokes another component program only when request or client data makes that child
  reachable; and
- opaque dynamic selection uses a localized ordinary-execution fallback.

The runtime must never execute both sides of a branch merely to reduce latency.

A selector-dependent child is wired by the local gate callback when its selector slot settles. A
list result wires one child instance per available key. A lazy edge loads and invokes its attached
server component program after authorization. These are dependency-driven continuations of the
same root render, not a central planner revisiting an application tree.

## Artifact registration and loaders

Build output contains package-local, target-specific module projections holding one or more
component templates and opaque references, not one application tree or mixed-target component
barrel. Authored public barrels and generated target-specific facet barrels remain valid linking
surfaces. This preserves separate compilation, multiple pages, reusable packages, lazy modules,
recursive components, finite registries, and bundler tree shaking.

Build adapters authorize the resolved server-executing package graph before its plans enter a
server artifact. The application registry:

1. validates plan and protocol versions;
2. rejects duplicate or unresolved opaque identities;
3. joins authorized target-matched component, continuation, render-program, context, enhancement,
   locale, and registry identities for one build generation without importing an
   opposite-environment facet;
4. validates that each component's attached contract and generated function agree; and
5. records authorized dynamic server-component loaders and operation ownership by build fingerprint
   and root component identity.

Known route roots and their eager components may be validated at startup. Infrequently used routes,
lazy components, finite registry candidates, and remote exposures may retain validated loader
records and validate their attached contracts on first authorized selection. Loading a server
component atomically installs its contract for the current build generation before invoking its
generated function. Registration does not compose a request graph, execute an application
continuation, or resolve a request-scoped value. Development replacement publishes a new immutable
plan generation atomically; live executions retain their original generation.

## SSR execution

An SSR request chooses the page or route root, creates a request-owned render context, and calls the
generated server render function with root props plus request/application contexts. The shared
context owns coordination rather than application planning:

```ts
type ServerRenderContext = {
	readonly scheduler: BoundedRequestScheduler;
	readonly publication: DeterministicPublication;
	readonly ownership: RequestOwnershipLedger;
	readonly contexts: RequestContextResolver;
};
```

Each invoked component owns a compact local frame containing its values, unresolved-input counts,
gate states, generations, and slot-consumer adjacency. Settlement visits the affected local edges
and any connected child-input slots rather than rescanning a global plan. The union of those local
frames is the request dependency graph, but the runtime never materializes or flattens it as a
separate planning artifact.

SSR dependency watchers are request-owned and ephemeral. Blocking transitions and render-region
dependencies participate in structural settlement. Nonblocking or indefinitely renewable sources
do not keep the response open forever: existing readiness, deadline, maximum-pass, cancellation,
and progressive-publication policy determines the response cut, after which unresumed server
watchers are disposed. Hydration arms the durable client watcher and may suppress its first
generation when SSR already settled that continuation.

Request execution proceeds as follows:

1. Invoke the selected root's generated server render function.
2. The generated function establishes ownership, local slots, transitions, regions, and immediately
   reachable child calls in authored order.
3. Each child repeats that operation synchronously, passing unresolved slot handles where values
   are not ready.
4. Every locally ready transition is offered immediately to the existing request-wide bounded
   scheduler.
5. A settled output fills local and child input slots, queues newly ready transitions, invokes
   selected child functions, and releases ready render regions.
6. The renderer executes released render programs and publishes HTML, resources, resumptions, and
   progressive regions in deterministic authored order.

Computation and region rendering may complete out of order. Publication remains ordered where the
existing SSR, Suspense, resource, and hydration contracts require it. A rejected or cancelled node
uses the same error boundary, fallback, cleanup, and generation rules as its equivalent authored
continuation.

The resulting acceleration comes from separating synchronous dependency wiring from asynchronous
HTML readiness. Invoking the root reaches and issues independent nested work before blocked parent
regions can render. A real selector or data dependency still gates its descendants; the generated
wiring does not pretend that an unavailable value exists.

## Client-only rendering

A client-only page invokes the generated client root, which creates durable instances and invokes
reachable child facets in the same dependency-aware manner. Those instances retain ordinary
inspectable `this.state`, props, contexts, tasks, lifecycle, and owned resources.

Client setup activation reuses the current task activation path, extended with explicit availability
and transaction-coalesced dependency snapshots. The proposal does not add a second client task
scheduler.

Client continuations may be asynchronous and may depend on results from other client continuations:

```text
route parameter ─> load draft ──────> editor region
                         └──────────> validate draft ─> diagnostics region
feature flags ──────────────────────> validate draft
```

The generated client root creates these durable watchers during setup. `load draft` begins when its
route input is available. Its committed output populates the draft slot, which issues validation
once feature flags are also available and releases the editor region independently. A later route,
draft, or flag change creates new generations under the authored concurrency policies; stale async
results cannot publish.

This is fine-grained client execution, not component rerendering. Component setup still runs once,
and only affected continuation watchers, structural gates, derived computations, and DOM regions
advance. Loading, error, task status, Suspense, Activity, and inspection continue to observe the
existing task generations.

Client plan execution differs from SSR in allocation and lifetime:

- constants and single-consumer safe expressions may be fused into client computations;
- live prop forwarding connects an existing publisher to child input consumers without redundant
  derived cells;
- shared calculations retain one component-owned derived primitive;
- structural gates own branch, list, registry, and lazy child generations;
- render programs patch their owned DOM ranges directly; and
- task/event consumers retain durable sampling and cancellation semantics.

Client-only components contribute no initial server transition nodes. A client-only boundary may
still expose compiler-extracted server child slots during SSR when the descendant's component,
props, reachability, and authorization are provable without executing browser-only code.

A server task invoked later by a client interaction is an executor in the attached server contract.
It is registered as an allowlisted transition but is not inserted into the initial SSR execution
graph merely because its definition is reachable. Its activation root is the interaction and owning
client generation.

Hydration adopts the client facet and its durable state from SSR publication. It does not repeat
settled initial server transitions merely to rediscover their values.

## Setup, state, and ownership

Component setup remains setup-once. Compiled initialization programs may establish state, derived
bindings, contexts, task ownership, and safe child inputs before DOM traversal, but only where the
compiler proves the same authored ordering and observable behavior.

Opaque calls, enhancement ownership, resource acquisition, lifecycle registration, or unsupported
control flow stop advancement at the smallest affected region. The component retains a localized
ordinary setup/render fallback rather than making the entire application unplannable.

Execution slots are not a second hidden application-state store. On the server they hold ephemeral
request values and staged transition outputs. On the client they map to or sample the durable,
inspectable component state and prop model. Inspection can always correlate a compact slot with its
component, source definition, provenance, generation, and consumers without publishing source
paths as runtime protocol identity.

Each instantiated node is owned by the tuple of component-plan node, component instance, key when
present, and generation. Withdrawal of a branch, replacement of a keyed item, unmount, request
abort, deadline, or newer generation cancels affected work and fences stale settlement.

## Scheduling and publication

Watcher readiness is permission to queue work, not permission to exceed
`maxAsyncSsrConcurrency`, task concurrency policy, client scheduling policy, or an upstream
service's own semaphore.

Execution must preserve:

- request deadlines and abort propagation;
- task priority, readiness, concurrency, and generation fencing;
- nearest component error boundary and Suspense ownership;
- deterministic authored-order HTML, resource-hint, inspection, continuation, and hydration
  publication;
- staged state/context effects and exactly-once transition execution;
- reverse-order cleanup of unpublished successful work after failure; and
- localized ordinary execution for an unproven or malformed plan region.

Depth-first interval labels may be emitted for immutable template containment when they materially
reduce validation cost. They must not be copied onto every live component or mounted DOM record.
Logical component ownership, physical DOM ownership, portals, and dynamically attached instances
remain distinct relationships.

## Trust, transport, and artifact isolation

Plan metadata cannot grant execution permission. Server/client placement, bundler component-library
authorization, context residency, secret qualification, continuation allowlisting, enhancement
selection, locale/catalog generation, lazy loading, and final client-artifact verification remain
authoritative.

Production plans use opaque build-scoped IDs and indexes. They contain no source text, executable
application closure metadata, secret values, or public module paths. Client artifacts receive only
`client.js` facets, resumption data, authorized dispatch stubs, and public transport contracts. An
SSR root reaches server component exports and their attached contracts through static or authorized
dynamic edges. An interaction host uses the build/root loader index to reacquire the same attached
contract without trusting client-supplied module identity. A server template, executor, or loader
must remain unreachable from the final client graph.

Malformed slot edges, executor indexes, gates, output claims, template identities, or authorization
fingerprints fail closed or enter the explicitly generated local fallback. Runtime code never
interprets authored component names as protocol identity.

## Inspection and diagnostics

Inspection reports the component template, instance generation, continuation or render node, source
range, input provenance, and one stable state:

- `inactive` with its unresolved branch, registry, list, route, or lazy gate;
- `waiting` with redacted dependency identities;
- `runnable`, `queued`, `running`, `settled`, `cancelled`, or `published`;
- `forwarded` when a value crosses a component port without another reactive allocation;
- `fused` when a safe single-consumer computation is emitted into its consumer; and
- `ordinary-fallback` with a reason such as `opaque-call`, `setup-order`, `dynamic-reachability`,
  `ownership-boundary`, `placement-boundary`, or `unsupported-identity`.

Expected conservative fallback and retained reactive allocation are inspection information, not
author warnings. Diagnostics are reserved for contradictory placement, invalid task contracts,
unsafe transport, or plan invariants that cannot preserve correct ordinary execution.

## Implemented shape

1. Native analysis creates the target-neutral ports, transitions, and reactive-allocation records
   after task placement and continuation effect analysis.
2. Client and server lowering independently project the canonical record and compact its ports.
3. Component construction validates and instantiates local generation-bound output slots before
   authored setup runs.
4. Setup activation creates an availability-aware watcher. A predecessor output replaces the
   authored reactive source only when the plan proves that local edge.
5. Issuing a generation makes its outputs pending; successful settlement publishes current state,
   while failure and cancellation terminate the matching generation and fence stale publication.
6. Generated JSX forwards direct state outputs and live props through the existing reactive value.
   Structural or computed expressions keep the existing allocation path.
7. Async SSR constructs reachable compiled children before draining compiler-planned parent work.
   Root task generations enter the shared request scheduler; nested task frames retain their
   existing structural permit and cannot deadlock by reacquiring it.
8. Existing target modules, component-attached contracts, registries, lazy loaders, hydration
   records, render programs, and bundler reachability remain the structural and authority layers.

The compact record can adopt denser opcodes after profiling without changing this contract.

## Verification

- Native compiler tests cover shared producer/consumer ports, setup versus interaction activation,
  client-only tasks, environment projection, state-output propagation, and live prop forwarding.
- Contract tests reject malformed indexes, paths, placements, transition references, and reactive
  allocation records before execution.
- Dependency-source and watcher tests cover pending versus available `undefined`, atomic snapshots,
  transaction coalescing, equal publication, replacement generations, terminal sources, disposal,
  and stale-producer fencing.
- Component runtime tests cover initially unavailable predecessor output, downstream activation,
  generation publication, and interaction-only visible values.
- SSR tests cover early reachable-child wiring, unresolved parent-to-child output forwarding,
  ordinary fallback behavior, and request concurrency one.
- Existing registry, lazy, hydration, task-policy, artifact-isolation, and ownership suites remain
  the regression boundary for the unchanged structural layers.

## Acceptance criteria

1. The compiler emits one canonical component execution IR and attaches a compact target projection
   to each generated component contract in the existing separate server and client artifacts.
2. Invoking a selected generated root synchronously calls every currently reachable generated child
   function and issues ready continuations without a separate server planning or graph-flattening
   pass.
3. Eligible setup transitions start only when every explicit dependency source is available, and
   their outputs make downstream transitions and existing reactive render regions ready.
4. A continuation watcher never issues a partial dependency set, issues at most once for one
   published dependency-version vector, captures one atomic input snapshot per generation, and
   delegates reissuance, cancellation, and stale settlement to the existing task policies.
5. A new upstream generation makes its generation-bound outputs pending without erasing an
   independently retained visible value; success publishes current outputs, while failure or
   terminal cancellation settles and cancels downstream ownership without leaving blocked watchers.
6. Existing structural rendering instantiates only active branch, list, registry, lazy, and
   recursive children; interaction-only tasks never execute merely because their plans exist.
7. Server-only, client-only, isomorphic, and distributed component facets preserve placement,
   artifact isolation, authorization, and hydration behavior.
8. Server execution uses bounded request-owned slots and the existing scheduler; client execution
   retains durable inspectable state and allocates reactive primitives only when required by
   observable semantics.
9. Client-only async continuation chains issue from the same availability-aware watchers, publish
   only current generations, and advance affected DOM regions without rerunning component setup.
10. Safe direct prop forwarding reuses an existing reactive identity, while compiler allocation
    records preserve computed, snapshot, structural, and explicit live allocations.
11. Output, side records, errors, DOM identity, state/context publication, and cleanup are equivalent
    to ordinary authored execution across concurrency settings and settlement orders.
12. Every instantiated node is owned, bounded, cancellable, generation-fenced, and observable.
13. Production execution requires no compiler process, source text, application closure metadata,
    secret value, or public module path.
14. Dynamically selected server components carry their own matching plan and executor authority;
    existing authorized build/root loaders reacquire that authority without render-local planning.
15. Target-specific roots and ordinary bundler reachability exclude unused component facets and
    opposite-environment implementations. A side-effect-free file containing several components can
    drop unused component exports while authored evaluation side effects, component-library barrels,
    and optional target-specific facet barrels retain ordinary ESM behavior.
16. Representative nested server workloads improve materially, and representative client-only
    workloads reduce avoidable allocation or update work, without unacceptable CPU, heap,
    compressed-byte, startup, hydration, or concurrent-request regression.
