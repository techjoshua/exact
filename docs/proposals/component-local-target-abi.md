# Component-local target ABI and exhaustive specialized execution

## Status

**Implemented and accepted.** Phases 0 through 9 are accepted in the
[performance ledger](../performance-baselines/component-local-target-abi.md). This proposal replaced
the direction in which native execution was a universal component or VNode runtime with
compiler-selected target operations. The implemented framework behavior is documented in
[`compiled-component-artifacts.md`](../compiled-component-artifacts.md). Phase 9 verified the full
acceptance surface and completed the proposal with its 50-sample matrix.

The proposal is decision-complete about the central architecture:

- each native eXact component completely specializes its own interior behavior;
- every component of a target implements the same target-specific component ABI;
- parents compose children by calling that ABI without inspecting or proving the child's interior;
- parents publish prop key/value updates while the receiving component owns prop dirtiness and its
  resulting interior work;
- shared runtime functions perform focused operations selected by generated code;
- every currently valid native source form receives a complete target lowering;
- diagnostics remain for independently invalid source and target-contract violations, not missing
  optimization coverage;
- React-owned work enters through a precompiled native compatibility component; and
- universal native component, VNode, binding, and SSR fallback execution is removed.

Names and compact encodings shown below are illustrative internal contracts. They are not proposed
application APIs.

Post-acceptance specialization now includes compiler-selected native SSR attribute operations.
Render-program ABI version 5 carries immutable component-local root attribute plans and selects
focused ordinary, class, style, URL, unsafe-HTML, and form-control behavior where the compiler has
proved the exact authored property. Spreads, target contributions, and other unproven cases retain
the focused generic attribute operation. The server renderer consumes the selected operation
without introducing a render tape, inspecting child output shape, or retaining request values in
the module-level plan.

The conceptual ABI relocates existing framework behavior behind target artifacts; it does not
redefine component lifecycle, Activity retention, hydration recovery, task readiness, error
cleanup, or request ownership. Unless this proposal explicitly replaces a behavior, the referenced
framework contracts below remain authoritative. In particular, an illustrative method signature is
not required to restate every existing ownership and failure rule that its implementation must
preserve.

## Framework context required to interpret this proposal

This proposal changes compiled execution architecture, not the eXact component model or the set of
currently valid developer-authored TypeScript and TSX. Read it against these existing contracts:

| Context                        | Required baseline                                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Component semantics            | [`component-language.md`](../component-language.md) defines a component as one compiler-analyzed durable state machine, with parent-owned props and instance-owned state, work, contexts, refs, resources, and lifecycle.                  |
| Current artifact migration     | [`compiled-component-artifacts.md`](../compiled-component-artifacts.md) describes the target-paired artifacts, indexed storage, direct update programs, focused operations, and generic lanes from which this proposal proceeds.           |
| Dynamic component identity     | [`component-registries.md`](../component-registries.md) defines finite and lazy selection, compiled identity, open client-only selection, generation fencing, and the rule that foreign callables do not become native components.         |
| Async component work           | [`distributed-component-continuations.md`](../distributed-component-continuations.md) defines async source as synchronous construction plus compiler-owned restartable work, not an async runtime component function.                      |
| Server and hydration ownership | [`ssr-hydration.md`](../ssr-hydration.md) defines request-local server frames, early child issuance, resumption authorization, generated hydration claims, and range-local mismatch recovery.                                              |
| Package composition and trust  | [`component-library-trust.md`](../component-library-trust.md) defines precompiled package artifacts, build-time authorization, target-local implementation ownership, and composition without evaluating or recompiling dependency source. |
| React ownership                | [`react-compatibility.md`](../react-compatibility.md) defines React as an explicit adoption boundary rather than the model for native component execution.                                                                                 |
| Measurement contract           | [`performance.md`](../performance.md) defines the bundle, startup, update, SSR, hydration, and retention measurements that architectural claims must satisfy.                                                                              |

The following interpretation rules are architectural prerequisites, not optional implementation
preferences:

1. A native component value always denotes an already compiled target artifact. Runtime selection
   chooses among artifacts; it never generates, compiles, brands, or infers a component from an
   arbitrary function.
2. The outer component function remains a compiler-analyzed definition for one durable instance. It
   is not repeatedly executed to rerender and must not acquire React-style hook or dispatcher
   semantics during this migration.
3. JSX is authored source syntax. A current VNode-shaped intermediate is not the required runtime
   architecture and does not justify retaining a universal VNode or function-component executor.
4. Authored dynamism is part of the source contract. Conditions, variable collections,
   `props.children`, typed helpers, registries, the existing open client boundary, enhancements,
   portals, Suspense, Activity, unsafe HTML, and ordinary TypeScript control flow must receive
   complete target lowering.
5. A compiler-selected focused operation is not a fallback. Generated code may explicitly call
   shared text, property, event, range, reconciliation, scheduling, escaping, or error operations
   required by the authored behavior. A fallback exists only when runtime code must compensate for
   a native lowering the compiler did not complete.
6. Difficult valid source blocks fallback removal as missing compiler coverage. It does not become
   invalid source, require a React rewrite, or justify an application-local renderer workaround.
7. Props remain parent-owned inputs, but the receiving artifact owns its prop storage, receipt
   dirtiness, dependency routing, and interior consequences. Parent artifacts do not carry child
   operation masks or inspect child topology.
8. `props.children` and other compiler-produced child values do not require a second universal
   child-component, slot-object, tape, or interpreter architecture. The supplying generated code,
   receiving component-local operation, and focused range ownership preserve their existing
   semantics. The receiving component does not inspect or need to know whether an opaque child
   value contributes text, intrinsic output, another compiled component, a collection, or no
   output. A focused range operation may distinguish those authored value shapes as required to
   place or reconcile them; when the value is a native component, it invokes the component's target
   ABI rather than selecting a component execution model.
9. Module, package, registry, and lazy boundaries do not weaken the ABI. Published libraries carry
   target artifacts and inert analysis facts; consumers do not require dependency source or
   recursive descendant closure.
10. Async authored components remain synchronous construction plus owned tasks and continuations.
    Client artifacts do not become promise-returning component executors.
11. Server artifacts are immutable. Requests own frames, tasks, contexts, signals, serialization
    state, failure cleanup, and disposal; no request value is retained by an artifact or recovered
    through a client-style durable instance.
12. React values remain opaque to native execution inside precompiled compatibility artifacts.
    React compatibility may retain its own reconciliation internally but does not reopen generic
    native execution.
13. Inspectability is preserved through durable instances, named state and prop facades, explicit
    inspection owners, and lazy capability sidecars. Specialization must not hide state or add
    unconditional DevTools machinery to production artifacts.
14. Client attachment is initial ownership establishment, either by fresh mount or same-build
    adoption. Activity parking and reactivation move or reconnect the already mounted range and
    publish activation changes; they do not attach the component again. Construction and attachment
    failures release partial ownership, and final component disposal remains idempotent.
15. Calling the server `issue` operation begins request-owned issuance but does not imply that all
    supplied props are already available. An immediately ready component may return its frame
    synchronously. A dependency-blocked component may return a promise while the request owns the
    pending issuance and its eventual frame, failure cleanup, cancellation, and disposal.
16. Removing generic native component execution is distinct from removing focused structural
    reconciliation. A runtime operation may reconcile an authored dynamic child range without
    inspecting a native component's interior or choosing how that component executes.
17. A module-level function that returns compiled JSX is an operation factory, not an implicit
    component instance. Its ordinary parameters are finalized when the factory is called because
    no durable owner exists to receive later reactive updates. A compiled component forwarding one
    of its props remains different: its artifact emits the standard prop receipt and receiver-owned
    update route.
18. Client and server artifacts must publish matching hydration topology. If a client artifact
    needs a focused range around opaque component output, the paired server artifact emits that
    boundary even though it installs no client update subscription and never classifies the
    output's eventual text, intrinsic, component, collection, or empty shape.
19. Replacing a component domain does not transfer foreign descendants into that domain. The
    renderer parks opaque operations owned by other domains, invokes the replacement artifact, and
    reattaches matching operations with their existing instances, state, contexts, scopes, update
    routes, and lifecycle. This applies to root replacement and to a nested replacement caused by a
    server protocol patch.

### Current source anchors

These files are starting points for migration and regression tracing. They show existing contracts
and the generic paths to replace; their current module shapes are not architecture that this
proposal requires preserving. The implementation claims and paths in this section were reviewed
against
[framework commit `815cf74307a95b9d726fbea782803f47e4c828a6`](https://github.com/techjoshua/exact/tree/815cf74307a95b9d726fbea782803f47e4c828a6).
The relative file links intentionally continue to follow the working tree:

- [`packages/core/src/component/contracts.ts`](../../packages/core/src/component/contracts.ts)
  contains the authored component, durable instance, child, readiness, and ownership contracts.
- [`packages/core/src/component/compact-instance.ts`](../../packages/core/src/component/compact-instance.ts)
  demonstrates current compact state/props facades, construction cleanup, idempotent disposal, and
  optional inspection publication.
- [`packages/core/src/component-contracts.ts`](../../packages/core/src/component-contracts.ts)
  contains the current composed component contract and continuation indexes that Phase 1 replaces.
- [`packages/core/src/component-definition-contracts.ts`](../../packages/core/src/component-definition-contracts.ts)
  contains the current component-local indexed dependency and dirty-operation mask contract.
- [`packages/compiler/src/contracts/transform.ts`](../../packages/compiler/src/contracts/transform.ts)
  contains current client, hydrate, complete, and server-render artifact projections.
- [`packages/dom/src/renderer/mounting/root.ts`](../../packages/dom/src/renderer/mounting/root.ts)
  contains the general function-component mount and render path that direct client composition
  removes.
- [`packages/dom/src/renderer/render-program-bindings.ts`](../../packages/dom/src/renderer/render-program-bindings.ts)
  and
  [`render-program-children.ts`](../../packages/dom/src/renderer/render-program-children.ts) show the
  focused binding and structural operations to retain or reshape behind generated component output.
- [`packages/ssr/src/render/direct-component-contracts.ts`](../../packages/ssr/src/render/direct-component-contracts.ts)
  shows the current request-local direct issuance and publication foundation for the server ABI.

## Decision summary

Component boundaries are compilation boundaries, not barriers that require runtime classification
or whole-application proof. A component artifact is immutable, target-specific executable code.
Its client or server instances contain all mutable ownership. The parent knows only the artifact's
standard ABI and invokes it directly.

```text
compiled parent interior
  -> child target ABI
       -> compiled child interior
            -> focused shared operations
```

The required architecture is not:

```text
generic renderer
  -> inspect a VNode or function
  -> read a component contract
  -> classify its capabilities
  -> choose a specialized path or generic fallback
```

Whole-tree linking may later inline or fuse component calls, but it is an optional optimization.
Ordinary composition, imported packages, lazy registries, SSR, hydration, and continuations must
not depend on recursive closure of a component graph.

## Motivation and correction

The existing specialization work established useful foundations: target-paired artifacts, indexed
state and props, direct update masks, direct render-program claims, request-local SSR frames,
compiler-planned tasks, and capability-specific imports. It did not finish the intended
architecture because it retained the universal execution model around those fast paths.

Important remaining examples include:

- specialized JSX lowering may decline a region and return to ordinary VNode lowering;
- target-neutral artifacts can carry an executable materialized JSX fallback;
- dynamic and lazy server components can select a generic server lane;
- imported component edges prevent selection of compiler-closed SSR entry points;
- missing property writers can select generic watched property binding;
- DOM component mounting still constructs an instance, calls a general render operation, normalizes
  VNodes, and retains component-wide rerender invalidation; and
- React compatibility constructs runtime artifacts and converts React elements into eXact VNodes.

Those behaviors are not required consequences of flexibility. They result from placing the
universal renderer beneath native component composition. This proposal puts the target ABI beneath
composition instead.

## Goals

- Compile every supported native component into a complete target executable.
- Make component-local generated code own JSX topology, reactive wiring, tasks, lifecycle, and
  disposal.
- Invoke local, imported, published, finite, and lazy components through one ABI per target.
- Preserve durable, inspectable component instances and ordinary `this.state` authoring.
- Preserve server work issuance as soon as dependencies are available, independent of HTML order.
- Support client-only, SSR-only, hydratable, isomorphic, server-continuation, Node, and Bun modes.
- Preserve the currently supported component language, including ordinary TypeScript control flow
  and intentionally dynamic authored behavior.
- Remove universal native component classification and rerender infrastructure.
- Keep React semantics and runtime selection contained within a native React-island component.
- Reduce client decoded and executed code, function count, startup CPU, and retained heap.
- Reduce per-request SSR classification, durable-instance allocation, and generic traversal.
- Treat failure to lower otherwise valid native source as an incomplete compiler implementation,
  not a reason to narrow the source language.

## Non-goals

- Inline every component into its parent.
- Require a compiler to inspect a dependency's source or descendant graph.
- Restrict currently valid developer-authored TypeScript or TSX to make specialization easier.
- Turn a component tree into one application-wide tape or interpreter program.
- Remove focused shared operations such as text updates, keyed reconciliation, event routing,
  escaping, scheduling, or error reporting.
- Change native eXact into a rerendering or virtual-DOM framework.
- Hide component state, tasks, ownership, or lifecycle from DevTools.
- Preserve old component artifact ABIs or transitional execution paths.
- Make React-owned components native eXact components internally.
- Treat an arbitrary function or object as a native component.

## Terminology

**Component artifact** is immutable compiler output for one component and one target.

**Component instance** is the durable client-owned state, props, ownership, and inspection record
created from a client artifact.

**Server frame** is request-local state created by a server artifact. No frame or request value is
stored on the shared artifact.

**Focused operation** is a runtime function selected explicitly by generated code, such as
`setText`, `reconcileKeyed`, or `escapeText`.

**Component operation** is the opaque compiler-issued value that names an already selected
target-artifact invocation. It carries the component contract and its inputs privately so the
selected target can construct, attach or adopt, receive later props, and dispose the component.
It is a claim ticket for those operations, not a description of rendered output: it exposes no
node kind, component type, child topology, or materialize-to-VNode operation. What the component
ultimately owns may be text, an intrinsic, several nodes, another component, a focused dynamic
range, or no output, and the caller does not need to know which.

Every such operation has opaque identity so reactive change detection cannot structurally coalesce
two publicly empty handles. That identity is only a realm-stable protocol brand: it carries no
operation kind, component type, child topology, target payload, or materialization capability. The
issuing runtime keeps the actual inputs in private storage and the selected target alone redeems
them.

**Prepared server invocation** is the target-private, request-local carrier used when generated
server code and the selected server renderer already share one closed ABI. It may hold the selected
server artifact, finalized props, a prepared child range, or a prepared keyed child directly. It is
not a public component operation, never crosses a client/server or compatibility boundary, never
enters reactive state, and is not serialized. Consequently it needs neither realm-wide redemption
storage nor a separately allocated opaque identity. The renderer consumes it immediately without
classifying its eventual output. Opaque component operations remain required wherever a value can
escape that closed server call chain, including client ownership, protocol publication, dynamic
public values, and foreign compatibility boundaries.

Private redemption storage is realm-wide and protocol-versioned. If packaging loads equivalent
copies of a runtime module into one JavaScript realm, either copy can redeem an operation issued by
the other without putting a discriminator or topology on the public handle. Reactive containers
preserve that opaque identity instead of proxying, cloning, or structurally comparing it.

**Prop receipt** is one component-local application of parent-owned prop key/value updates. The
receiving instance owns prop storage, dirtiness, dependency routing, and the resulting work.
“Receipt” is reserved for this atomic delivery meaning in the architecture. Some implementation
identifiers created during the migration still say `ComponentReceipt`; those identifiers represent
the opaque component operation above and must not be interpreted as a rendered-node receipt.

**Compiler-selected dynamic operation** is target-specific generated behavior required because the
authored semantics are dynamic, such as reconciling a variable collection, placing
`props.children`, or selecting an already compiled component artifact. It is not a fallback for a
lowering the compiler failed to emit.

**Foreign boundary** is a compiled native component whose interior delegates to another ownership
model, such as a React island.

**Generic native fallback** is runtime interpretation or classification used because the compiler
did not completely emit a native component's target behavior. This proposal removes it. A focused
operation explicitly selected by complete generated output does not become a fallback merely
because the authored behavior it implements is dynamic.

## Target artifact model

Build-time analysis metadata, client executable code, server executable code, and transport
metadata are distinct products. Runtime bundles must not retain build inventories merely because a
component was compiled.

An application root is not a property of a component definition. It is a mount, hydration, worker,
document, or server entry selected by the build adapter from the bundler's entry and module graph.
One application may have any number of independent roots, and the same component may be reachable
from several of them. The component compiler therefore emits only local component identities,
imports, target reachability, registry entries, continuation operations, and boundary facts as
out-of-band build products. The bundler joins those facts with its configured entries and resolved
module graph, emits the required target executables and transport registrations, and then discards
the inventories. Only executable target data required after startup may survive in a runtime
chunk.

Compiler analysis currently uses `role: "root"` for a public implementation owned by a component
contract. In that vocabulary, _root_ means the implementation at the root of that component's
generated partition, not a singleton application or page root. Likewise, an `exposureRoot` is a
module export through which an artifact graph exposes a component. Neither term grants application
entry ownership or implies that only one root exists.

### Client ABI

Every client component implements the same conceptual operations:

```ts
interface ExactClientComponent<Props, Instance> {
	readonly id: string;
	readonly template: ExactCompiledTemplate;

	construct(parent: ExactComponentInstance | undefined, props: Props): Instance;
	attach(
		instance: Instance,
		target: ExactAttachmentTarget,
		mode: ExactAttachMode
	): ExactMountedRange;
	receive(instance: Instance, updates: ExactPropUpdates<Props>): void;
	dispose(instance: Instance, reason: unknown): void;
}
```

`attach` covers fresh mount and hydration because both claim the component's known topology and
install the same generated ownership. Components that genuinely need distinct work may delegate to
separate generated functions behind that entry point.

`attach` is the instance's initial fresh-mount or same-build-adoption transition. It is not called
again when Activity parks, backgrounds, or reconnects the mounted range. Existing lifecycle timing
remains unchanged: mount publishes after attachment succeeds, activation follows connectivity,
deactivation describes retained disconnection, and unmount is final disposal. A failed `construct`
or `attach` releases any ownership established by that attempt while preserving the primary
failure. `dispose` is idempotent and releases the instance, its mounted range, generated work, and
lazy capability sidecars exactly once.

The stable interface does not require a unique wrapper function for every method. An inert method
references a shared implementation such as `noReceive` or `noDispose`. Generated functions are
module-level and closure-free. Artifact objects point directly to them.

`ExactPropUpdates` is conceptual. Generated code may use numeric prop slots, compact positional
arguments, or another allocation-free target encoding rather than materializing an array of tuples
or a partial props object. The semantic contract is one batched receipt containing the final
key/value update for each supplied prop, including an explicit absence value when absence is
observable.

### Server ABI

Every server component implements the same conceptual lifecycle:

```ts
interface ExactServerComponent<Props, Frame> {
	readonly id: string;

	issue(
		request: ExactRequestExecution,
		parent: ExactServerFrame | undefined,
		props: Props
	): Frame | Promise<Frame>;

	write(frame: Frame, output: ExactHtmlWriter): void | Promise<void>;
	dispose(frame: Frame, reason: unknown): void | Promise<void>;
	execute?(
		operation: number,
		request: ExactRequestExecution,
		activation: unknown
	): unknown | Promise<unknown>;
}
```

`issue` creates only request-local state and starts ready work. `write` publishes output in authored
order. `execute` is present only on artifacts with server continuations; an artifact without it
uses a shared unreachable/default implementation or a target encoding that does not retain the
operation.

Calling `issue` establishes request ownership immediately. If required props are already available,
the operation may allocate and return the frame synchronously. If one or more supplied props depend
on unfinished compiler-owned work, the call returns a request-owned promise and allocates the frame
when those inputs become available. The request retains cancellation and cleanup authority over the
pending issuance and disposes a rejected, superseded, unconsumed, or successfully written frame
without transferring request state to the immutable artifact. This is why the conceptual return
type permits `Promise<Frame>`; it does not make the component itself an async runtime function.

### Artifact identity and trust

The build validates component artifacts and target selection. A trusted compiled artifact is not
recursively validated on every mount or request. Network, plugin, continuation, and authorization
boundaries retain validation appropriate to their independent trust boundary.

Native identity proves only that the value implements the current target ABI. It is not a request
to infer placement, construction lane, lifecycle, or renderer behavior at runtime.

## Component-local generated output

The compiler owns one component's complete interior:

- static template or server literal segments;
- mount and hydration claim paths;
- state and prop slot layout;
- derived and task dependency indexes;
- event and form bindings;
- direct scalar and property updates;
- conditional and keyed structural operations;
- child component ABI calls;
- context, ref, localization, logging, and lifecycle operations;
- error, Suspense, Activity, portal, and unsafe-HTML boundaries;
- server issuance and serialization order;
- resumption publication and continuation execution; and
- deterministic cleanup.

Generated code calls focused runtime operations directly. It does not hand a general renderer a
descriptor and ask it to rediscover which operations apply.

```ts
function attachIncidentRow(instance, target, mode) {
	const root =
		mode === Mount ? cloneTemplate(incidentRowTemplate, target) : claimElement(target, 'li');

	instance.nodes = claimIncidentRowNodes(root);
	listen(instance.nodes.button, 'click', selectIncident, instance);
	updateIncidentRow(instance, InitialDirtyMask);
	return ownSingleRoot(root, instance);
}

function updateIncidentRow(instance, dirty) {
	if (dirty & SelectedMask) setClass(instance.nodes.root, selectedClass(instance.state[Selected]));
	if (dirty & SeverityMask) setText(instance.nodes.severity, instance.props[Severity]);
	if (dirty & TitleMask) setText(instance.nodes.title, instance.props[Title]);
}
```

This proposal does not require abandoning templates. Template cloning is often a highly optimized
browser operation. Direct DOM construction and hybrid creation remain component-local backend
choices that can be compared empirically without changing the ABI.

## Component composition

### Static and imported children

A component import is sufficient proof that the selected target artifact implements the target
ABI. The parent does not inspect the child's JSX or descendants.

```ts
const child = IncidentRow.construct(parent, props);
const range = IncidentRow.attach(child, slot, mode);
```

On the server:

```ts
const child = await IncidentRow.issue(request, parentFrame, props);
await IncidentRow.write(child, output);
```

Module and package boundaries do not change this behavior. Recursive graph closure is unnecessary.

### Prop updates

The parent compiler knows which child props consume which parent values. It invokes `receive` with
the final key/value updates produced by the affected parent expressions. It does not write child
storage, calculate child dirtiness, or carry the child's dependency or operation masks.

The receiving component stages the complete batch in its indexed prop storage, resolves dirtiness
with the same component-local prop publication semantics used by ordinary authored reads, and then
applies the resulting derived, task, DOM, and structural work once. Prop slot identity is part of
the component's input ABI; the mapping from a received prop to interior work remains private to the
child artifact. Multiple updates in one receipt are atomic, and compiler output normalizes a batch
to one final value per prop.

No parent rerender, child VNode replacement, prop-map comparison, or component classification is
required.

### Finite and lazy registries

A compiled registry contains target ABI artifacts:

```ts
const Child = registry[key];
const instance = Child.construct(parent, props);
Child.attach(instance, slot, mode);
```

A lazy registry changes only artifact availability:

```ts
const Child = await registry.load(key);
const instance = Child.construct(parent, props);
Child.attach(instance, slot, mode);
```

Selection and loading are dynamic. Execution is not generic. Registry replacement continues to
own key identity, generation fencing, range disposal, and stale-load rejection.

The existing compiler-authored open dynamic boundary remains client-only and may resolve only to an
already compiled artifact implementing the current client ABI. It changes when an artifact becomes
available and which artifact is selected; it does not define, compile, brand, or classify a native
component at runtime. Its generated owner retains availability, cancellation, generation fencing,
prop receipt, range replacement, and disposal as focused operations.

An open-ended foreign component value requires an explicit boundary. It is never accepted as a
native component because it happens to be callable.

## Client construction and state

Every native component remains a durable, inspectable instance. The artifact selects its compact
storage representation without a runtime capability probe.

- statically known state and props use indexed slots;
- component-local generated masks route state and received-prop changes to direct operations;
- inspectable named facades are lazy views over those slots;
- nested or escaped dynamic objects retain focused proxy reactivity when required;
- uncommon lifecycle, list, task, context, or inspection state uses lazy sidecars;
- resource and effect ownership is released by the artifact's `dispose`; and
- no component-wide render watcher exists for a completely compiled native interior.

Structural expressions use explicit generated operations. A conditional owns a range and case
identity. A keyed list owns its key-to-range table. `props.children`, ordinary TypeScript control
flow, typed helpers, finite and open dynamic selection, enhancements, portals, Suspense, Activity,
unsafe HTML, and other currently valid authored forms retain their existing semantics through
complete component-local lowering and explicitly selected focused operations. The compiler does not
turn a valid opaque expression into an error merely because a specialized lowering is incomplete.

`this.map()` therefore issues a dynamic child-range operation containing keyed child operations,
not a Fragment VNode. Each materialized key owns its reactive resources until the target releases
that keyed range; reorder preserves the range, removal stops it, and same-build hydration adopts
the compiler-owned server item markers.

On the server, a compiler-closed `this.map()` callback prepares the equivalent request-local child
range and keyed-child carriers directly. These carriers are an execution ABI, not a rendered tree:
neither the parent nor the renderer asks whether a child becomes text, an intrinsic, another
component, several nodes, or nothing.

Enhancement providers are semantic component parents for context and inspection, but they are
transparent to compiler-indexed update ownership. A provider inserted around authored output must
not become the owner of that output's state or prop update program; the generated operation remains
bound to the durable authored component while the provider retains its ordinary lifecycle.

## Mount and hydration

The client artifact owns both fresh mount and same-build adoption. It knows its root shape, node
paths, child positions, control bindings, and dynamic ranges.

Client-island activation is not an exception. The hydration registry resolves the compiled native
component and issues the same opaque component operation used by compiled parent composition.
Markerless adoption consumes that operation and its selected client artifact directly; it must not
wrap the component in a function-typed VNode or re-enter generic component dispatch.

Successful hydration must not:

- walk a generic component VNode tree;
- discover component capabilities;
- build a document-wide marker index for compiler-addressable nodes;
- install component-wide render watchers; or
- retain a second generic topology for recovery.

On mismatch, the owning component or root abandons the invalid range and invokes the same
artifact's specialized mount path.

Markers remain only when they carry required ownership:

- multi-root or empty dynamic ranges;
- independently replaceable structural boundaries;
- progressive or resumable server publication;
- Suspense, Activity, portal, or server-slot ownership; and
- boundaries whose location cannot be recovered safely from a stable element path.

Static single-root components and compiler-addressable child roots do not emit redundant component
comments. Marker removal is a consequence of stronger component-local ownership, not a separate
goal that may weaken correctness.

Within a compiler-closed render program, retained scalar, structural-child, and component ranges
use dense artifact-local base-36 ordinals in paired `x:` comments. Those ordinals are assigned from
the target-independent marker topology rather than from the complete client or server slot table;
target projection may omit unrelated slots without changing hydration identity. The enclosing
program root scopes repeated ordinals, so they do not become application-global protocol IDs.

A compiler-closed hydratable application root omits its outer component comment pair and publishes
the compact hydration proof `m: 1`. That proof selects markerless root attachment even when nested
structural markers remain. The hydration JSON script is root-owned transport metadata, not component
output, and stays outside the adopted component range. Unproven public or universal SSR calls retain
their marked-root behavior.

## Server execution and scheduling

Server artifacts are immutable and safe to share across simultaneous requests. `issue` allocates a
request-local frame containing only the state, props, task handles, contexts, lifecycle sidecars,
and resumption facts selected for that component.

The compiler emits an issuance plan separate from authored output order. When sibling inputs are
ready, sibling work starts before the writer reaches their HTML positions:

```ts
const header = Header.issue(request, frame, headerProps);
const results = Results.issue(request, frame, resultProps);
const sidebar = Sidebar.issue(request, frame, sidebarProps);

await Header.write(await header, output);
await Results.write(await results, output);
await Sidebar.write(await sidebar, output);
```

If a child's props depend on an unfinished task, its issuance is connected to that dependency and
begins as soon as the value becomes available. The child artifact owns its internal dependency
plan; the parent only owns availability of the props it supplies.

Server execution never constructs a client-style durable instance merely to call a render
function. It never classifies a component VNode, searches a contract catalog, or retries a general
render watcher. Stabilization remains bounded where authored tasks can legitimately change values
required by output.

Node and Bun adapters call the same artifact ABI. Bun uses its native request and response
infrastructure at the outer server boundary; component execution does not pass through a Node
compatibility layer.

## Continuations and pending client work

A server artifact with continuations exposes a generated operation dispatcher or indexed operation
table. The request boundary validates the opaque operation identity and activation payload, then
calls the owning artifact. It does not reconstruct a component graph.

The request-local frame records pending work that must transfer to the client. SSR publication can
serialize those compiler-owned activations with the component's resumable state. The paired client
artifact adopts them through its standard construction/attachment lifecycle. Cross-request
monitoring remains a client DevTools responsibility; server request records are disposed with the
request.

## React compatibility boundary

A React island is a precompiled native eXact component. The native parent sees only the normal
client or server ABI. The React component value and React element tree are opaque props owned by
the island.

```ts
const island = ReactIsland.construct(parent, {
	component: LegacyDashboard,
	componentProps: { accountId }
});
ReactIsland.attach(island, slot, mode);
```

The island's client methods own React mounting, hydration, updates, and disposal. Its server methods
own React-compatible serialization. React may use its own private element/node representation,
hooks, classes, reconciliation, and scheduling internally; none of those semantics justify a
generic native component renderer.

Because the compiler cannot inspect what an imported React component may produce internally, the
explicit compatibility operation owns its complete React renderer, including React's structural
and host capabilities. That renderer is a separate ownership system: it must not import eXact
`VNode` types or factories, return eXact VNodes from the island component, or route React output
through eXact's native VNode renderer. The island's target-ABI attachment delegates directly to the
React renderer and receives only an opaque mounted range in return. This is compile-time selection
of one self-contained foreign boundary, not runtime inference from a returned value. None of those
capabilities become reachable from a native-only artifact graph.

Statically known React JSX lowers to a call to the compiled island artifact. Runtime-selected React
values remain opaque inside that already compiled island. `ReactDOM.createRoot()` and server APIs
use precompiled root-host artifacts shipped by the compatibility package rather than constructing
component artifacts at runtime.

Those fixed artifacts may be loaded beside a target-local copy of core while their renderer bridge
uses narrow core subpath exports. Built-in coordination contexts used across that boundary (error,
logging, suspension, and readiness) therefore require realm-stable identities; equal descriptions
on distinct local Symbols are not equivalent. React conformance must exercise built package output,
not only source aliases, so this duplicate-module boundary is covered. Suspense distinguishes an
already committed fallback from retained primary content: only the latter keeps a transition
pending. React-version-specific server serialization remains owned by the React renderer.

Native children passed through a React-owned wrapper are represented by opaque compiled-artifact
handles. When React places such a child, the boundary invokes that child's target ABI. A native
child is not converted into an arbitrary VNode escape hatch.

“Child” at this boundary names an opaque compiled contribution, not a component-shaped value. The
contribution may ultimately produce text, an intrinsic range, another component, a collection, or
no output. Its handle exposes no `type`, `kind`, child topology, or materialize-to-VNode operation,
and the React island never branches on what it contains. The supplying component's generated
operation retains attachment, update, range identity, activity, and disposal ownership. When that
operation reaches a native component it invokes the component's target ABI; otherwise it performs
the explicitly selected focused structural work. The handle is a compatibility crossing for that
existing component-local operation, not a second universal child ABI, slot object, render tape, or
interpreter.

Production React compatibility must no longer depend on `createExactCompatibilityArtifact()`.
Importing no React compatibility boundary must make the complete React runtime unreachable from a
native application bundle.

## Component-library publication

A component library publishes:

- client executable artifacts;
- server executable artifacts;
- TypeScript declarations;
- non-executable compiler analysis metadata;
- continuation and authorization metadata when applicable; and
- conditional exports selecting the correct target.

It does not publish an executable untargeted fallback. The final application compiler does not
recompile library source or recursively inspect descendant implementations. It resolves the target
artifact, verifies the ABI and authorization at build time, and composes it like a local component.

Consumer coverage must include client-only mount, SSR plus hydration, Node SSR, Bun SSR, server
continuations, finite and lazy registries, nested libraries, and mixed client/server placement.

## Source-language preservation and diagnostics

All JSX in an eXact compilation is compiler-classified and lowered. There is no separate
"ordinary JSX" execution path. When this proposal distinguishes native and compatibility work, it
means the compiler selected a native target operation or an explicit compatibility operation; it
does not mean that one branch bypassed compilation. A compiler branch that emits generic VNode
construction for a valid native source form is incomplete native lowering, not a JSX fallback.

Every currently valid native component must produce a complete target artifact. A lowering function
does not return to generic execution when it encounters a difficult region, and it does not convert
missing compiler coverage into a new application diagnostic. Until every supported form has a
complete lowering, the compiler implementation and the corresponding removal phase are incomplete.

Diagnostics remain appropriate when source independently violates an existing component-language,
placement, target, capability, trust, or serialization contract. Such a diagnostic must identify:

- the invalid expression and source range;
- the target for which the existing contract was violated;
- the semantic reason the source is invalid independently of optimization;
- the supported explicit boundary, if one exists; and
- whether ordinary TypeScript restructuring can satisfy the existing contract.

Diagnostics must not recommend React patterns, manual VNodes, casts, application-local renderer
workarounds, or removal of otherwise supported behavior merely because target lowering is
incomplete.

## Runtime and compiler inventory

| Current responsibility                                | Decision                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Target-paired artifact emission                       | Retain and simplify around the target ABI                                                                                             |
| Indexed state/props and direct update masks           | Retain inside the owning artifact; props cross boundaries as key/value receipts                                                       |
| Direct template claims and bindings                   | Retain as immutable component-local tuples consumed by focused target operations                                                      |
| Direct request-local SSR frames                       | Retain behind `issue` and `write`                                                                                                     |
| Compiler task dependency plans                        | Retain and connect to request-local issuance                                                                                          |
| Component contract composition                        | Split build metadata from executable ABI                                                                                              |
| `typeof vnode.type === "function"` native mount       | Remove                                                                                                                                |
| General native `createComponentInstance()` path       | Remove                                                                                                                                |
| Native `renderInstance()` and rerender invalidation   | Remove                                                                                                                                |
| Native lowering that emits generic VNode construction | Replace with complete target-operation lowering for every currently valid native source form                                          |
| Generic render-program property bindings              | Remove from native artifacts                                                                                                          |
| Whole-tree compiler-closed SSR proof                  | Remove as an execution prerequisite                                                                                                   |
| Generic native SSR component lane                     | Remove                                                                                                                                |
| Executable target-neutral JSX fallback                | Remove                                                                                                                                |
| Runtime-created compatibility artifacts               | Replace with precompiled compatibility artifacts                                                                                      |
| React-private node representation                     | Keep private only if required inside the island; never carry a native child, invoke a native component, or become the native boundary |
| Focused DOM, reactive, task, and SSR operations       | Retain when explicitly imported by generated code                                                                                     |
| Test-only raw fixtures                                | Compile fixtures or isolate explicit test-only infrastructure                                                                         |

## Performance design

The uniform ABI must reduce reachability rather than add wrappers.

- Generated methods are top-level functions.
- Inert methods reference shared implementations.
- No method delegates through a second artifact adapter.
- Artifact fields contain executable target data only.
- Static child calls reference imported artifacts directly.
- Per-binding closures are emitted only for arbitrary authored JavaScript.
- Compiler-known dependencies use component-local indexes and masks; prop update boundaries carry
  only prop keys and values.
- Capability modules are imported only by artifacts that call them.
- Client and server artifacts never import each other's execution runtime.
- Compatibility packages form separate bundle roots.

The fixed comparison baseline for this proposal is:

| Metric                     | Current eXact baseline |
| -------------------------- | ---------------------: |
| Decoded client JavaScript  |          203,426 bytes |
| Profiled code              |          203,359 bytes |
| Executed code              |           83,943 bytes |
| Profiled functions         |                  1,188 |
| Invoked functions          |                    665 |
| Retained client heap p50   |        2,586,584 bytes |
| Startup script p50, 1x CPU |               20.01 ms |
| Startup script p50, 6x CPU |              168.85 ms |
| Warm navigation p50        |                30.8 ms |
| Warm FCP p50               |                  44 ms |
| Node sequential SSR p50    |                2.08 ms |
| Bun sequential SSR p50     |                1.42 ms |

Directional, overlapping hypotheses are:

| Change                                               | Expected effect                                              |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Remove native component dispatcher and rerender path | 10-25 KB and 80-180 profiled functions                       |
| Remove generic native VNode topology                 | 10-25 KB, 80-200 functions, and lower allocation             |
| Remove generic watched bindings                      | 5-15 KB and 30-100 functions                                 |
| Remove build analysis from runtime artifacts         | 5-15 KB plus lower parse/compile cost                        |
| Direct component ABI calls                           | Lower construction, classification, and call polymorphism    |
| Remove generic SSR lanes                             | 10-25% lower CPU for components currently using them         |
| Compiled hydration attachment                        | Lower readiness work, temporary allocation, and marker count |

These estimates overlap and are not completion claims. Initial outcome targets are 140-170 KB of
decoded client JavaScript, 55-70 KB of executed code, 750-950 profiled functions, 350-500 invoked
functions, 2.2-2.4 MB retained heap, 12-16 ms 1x script time, and 100-135 ms 6x script time while
preserving the current navigation and paint results. Measurement determines whether those ranges
are attainable.

## Delivery plan

The detailed execution order, correctness admission gates, diagnostic-measurement rules, and
phase-to-phase evidence format are defined in the
[component-local target ABI implementation plan](component-local-target-abi-implementation-plan.md).
That plan is the execution companion to this proposal; the architecture and acceptance invariants
remain authoritative here.

### Phase 0: Structural observability

Add generated-artifact reporting for native components, target artifacts, declined JSX regions,
generic bindings, generic renderer imports, generic SSR imports, runtime-created artifacts,
fallback-bearing artifacts, and parent artifacts that retain child dirtiness or operation-mask
routing. Record the fixed browser, startup, SSR, bundle, function, and heap baseline.

**Exit gate:** target-specific build reports distinguish native execution from explicit React,
plugin, and test boundaries. No later phase can be declared complete without a zero-fallback report.

### Phase 1: Target ABI contracts

Introduce cohesive client and server executable contracts. Separate build analysis, executable
methods, continuations, and authorization records. Emit the new artifact for every repository
component and migrate the artifact readers atomically. Do not retain an old-ABI adapter.

**Exit gate:** every native export has exactly one current target ABI and malformed or obsolete
artifacts fail at the build/owning boundary.

### Phase 2: Direct client component composition

Lower component tags to target ABI references. Make parent prop updates invoke child `receive`
directly with allocation-free key/value receipts. Make each child instance resolve its own prop
dirtiness and apply one atomic update for the receipt. Move component construction, attachment, and
disposal behind the artifact. Migrate native roots and remove the generic function-component branch
from native DOM mounting.

**Exit gate:** native mounts cannot reach general component construction, `renderInstance`,
component-wide rerendering, or generic child normalization for native component dispatch; parent
artifacts contain no child dirtiness or operation-mask routing. Focused range operations needed by
not-yet-migrated component interiors may remain until Phase 3, but a native component encountered in
one of those ranges already enters through its target ABI rather than a general function-component
branch.

### Phase 3: Exhaustive component interiors

Complete specialized lowering for intrinsic trees, scalar bindings, component slots, conditions,
keyed collections, portals, Suspense, Activity, errors, enhancements, unsafe HTML, and supported
opaque ranges. Replace every silent decline with complete component-local generated output and its
explicitly selected focused operations. Preserve diagnostics only where the authored source already
violates an independent language or target contract.

**Exit gate:** declined native JSX regions and generic property binding groups are zero across the
compiler corpus, packages, and applications, with no loss of currently valid source coverage.

### Phase 4: Client mount, hydration, and recovery

Unify mount and hydration through generated attachment. Make each artifact own claims, events,
controls, child ranges, and mismatch recovery. Remove redundant component markers where stable
paths or owned child ranges are sufficient.

**Exit gate:** successful same-build hydration contains no generic native traversal; recovery calls
the specialized mount method; client-only applications use the same artifact ABI.

### Phase 5: Server issue/write/dispose execution

Emit request-local issuance and serialization methods for every native server artifact. Call child
ABIs directly across modules and packages. Remove recursive whole-tree closure as a prerequisite.
Preserve early sibling and dependency-driven task execution. Migrate synchronous, scheduled,
resumable, and continuation modes on Node and Bun.

**Exit gate:** supported native SSR imports no generic component runtime and constructs no
client-style durable component instance.

### Phase 6: Dynamic selection

Compile static, finite, and lazy registries as ABI selection. Preserve keys, range ownership,
generation fencing, cancellation, and stale-load rejection. Reject open-ended native component
values unless they enter an explicit supported boundary.

**Exit gate:** dynamic selection never performs runtime component-kind or execution-lane
classification.

### Phase 7: Libraries and React compatibility

Publish target executables plus inert analysis metadata. Exercise nested package consumption across
all modes. Replace runtime-created React adapters and roots with precompiled React-island artifacts.
Represent native children crossing React ownership as artifact handles.

**Exit gate:** imported library components behave like local components; React compatibility is
unreachable when unused and does not require generic native execution when used.

### Phase 8: Removal and consolidation

Delete native generic construction, rendering, rerendering, property binding, server lanes,
target-neutral executable fallbacks, and production runtime-artifact factories. Move legitimate
foreign or test machinery behind explicit package entry points. Reorganize modules around the ABI,
attachment, issuance, structural operations, and compatibility ownership rather than preserving
transition-era files.

**Exit gate:** the structural report is zero for every native fallback category, source architecture
passes, and no transition path remains.

### Phase 9: Comprehensive verification and acceptance

Run all compiler, package, application, build-script, publishing, platform, Node, Bun, hydration,
SSR, continuation, React compatibility, and browser tests. Perform a fresh adversarial source audit.
Run 50-sample warm browser, 1x/4x/6x startup, Node SSR, Bun SSR, saturation, retention, build, and
bundle comparisons.

**Exit gate:** correctness passes; intended structural removals are demonstrated; performance is
evaluated across every metric rather than accepted from bundle size alone.

## Per-phase working discipline

Each phase is one complete architectural slice:

1. capture the structural and performance before-state;
2. implement the target slice;
3. migrate all affected repository consumers;
4. delete the superseded path in the same phase;
5. run focused and repository acceptance tests;
6. commit the phase;
7. admit performance measurement only after correctness and structural validity pass;
8. run the complete comparison suite and accept only valid results;
9. report the complete phase table, including all frameworks and p50/p75/p95/p99 values for every
   common metric;
10. compare the result with both Phase 0 and the preceding accepted phase;
11. explain every regression before proceeding; and
12. verify that no task-owned Node, Bun, Chrome, PowerShell, or compiler process remains.

“Valid results” in this proposal means correctness-gated, structurally applicable, complete,
deterministic evidence collected in the recorded environment. The framework-comparison suite's
separate specialist-review decision controls whether that project may publish a result as an
independent framework comparison; it does not determine whether the same complete raw run may enter
a component-local target ABI checkpoint. Checkpoints retain that publication status so the two
claims cannot be confused.

Targeted mid-phase measurements may guide a named implementation choice after the affected behavior
is correct. They remain diagnostic, report all metrics they collect, and never replace or update an
accepted phase checkpoint. Known-invalid implementations are fixed before measurement rather than
benchmarked for a comparison that cannot be accepted.

A temporary prerequisite regression is accepted only when its mechanism and removal phase are
documented and the prerequisite is necessary for the selected architecture. Smaller output alone
does not establish a performance improvement.

## Testing strategy

### Compiler

- Semantic tests for every supported JSX and component-composition form.
- Target projection tests for client, server, hydrate, continuation, and analysis artifacts.
- Negative tests proving independently invalid native forms retain their existing diagnostics.
- Source-preservation tests proving difficult, opaque, and intentionally dynamic valid forms receive
  complete target lowering rather than a new diagnostic.
- Generated-code assertions for direct child ABI calls and absent generic imports.
- Cross-module and packaged-library fixtures without recursive source inspection.
- Corpus reporting with zero declined regions and zero target fallbacks.

### Client and hydration

- Fresh mount, same-build hydration, mismatch recovery, and client-only roots.
- Direct props and state updates without component rerender.
- Batched prop receipt across local, imported, finite, and lazy composition, with child-owned
  dirtiness, one final value per key, observable absence, and no parent knowledge of child operation
  masks.
- Conditions, keyed replacement, lazy candidates, portals, Suspense, Activity, and errors.
- Focus, form state, refs, events, contexts, task ownership, cancellation, and cleanup.
- Marker-count assertions based on required ownership rather than blanket zero markers.
- DevTools inspection of compact instances and lazy sidecars.

### Server

- Synchronous, scheduled, streaming, hydratable, resumable, and continuation components.
- Early sibling issuance and dependency-ready execution independent of output order.
- Simultaneous request isolation, cancellation, cleanup, and generation fencing.
- Node and Bun native adapters with equivalent component semantics.
- Imported and lazy library components through the same ABI.
- Response stability, authorization, serialization limits, and failure cleanup.

### React compatibility

- Static and runtime-selected React island roots.
- Client mount, hydration, update, unmount, SSR, Suspense, hooks, classes, portals, and refs.
- Native children crossing into React and returning through artifact handles.
- Bundle tests proving compatibility code is absent from native-only applications.
- No production call to a runtime component-artifact constructor.

### Performance

- Warm navigation, DOMContentLoaded, load, FCP, LCP, blocking, long tasks, DOM inventory, retained
  heap, optimistic feedback, settlement, and protocol phases.
- 1x, 4x, and 6x readiness, script, parse, compile, evaluation, executed bytes, and function counts.
- Node and Bun startup, sequential and concurrent latency, TTFB, RPS, CPU, event-loop delay, GC,
  saturation, retention slope, and artifacts.
- Clean and incremental compiler/build time.
- Per-capability bundle reachability and source attribution.

## Acceptance invariants

For target-specific native builds:

```text
declined native JSX regions       = 0
fallback-bearing artifacts        = 0
generic native binding groups     = 0
generic native renderer imports   = 0
generic native SSR imports        = 0
runtime-created native artifacts  = 0
parent-owned child dirty routing  = 0
```

Additional invariants:

1. Every native component implements the current target ABI.
2. A parent never inspects a child's interior or descendant graph.
3. An imported component is invoked exactly like a local component.
4. Dynamic selection chooses an ABI value; it does not choose an execution model.
5. A parent publishes only child prop keys and values; the receiving artifact alone owns prop
   dirtiness and its mapping to interior work.
6. Every currently valid native source form remains valid and receives complete target lowering.
7. Runtime component selection chooses only already compiled artifacts; it never defines, compiles,
   brands, or classifies a native component on demand.
8. Every mutable server value is request-local and disposed with that request.
9. Setup tasks begin when compiler-known dependencies are ready, not when HTML traversal happens to
   reach them.
10. Successful hydration uses generated ownership and claim paths.
11. Native state, tasks, resources, and lifecycle remain coherently inspectable.
12. React-owned values remain opaque inside a precompiled native island.
13. Compatibility, plugin, and test infrastructure is absent from bundles that do not select it.
14. Obsolete artifacts and independently invalid native source fail rather than transition to
    generic code.
15. Missing lowering for valid native source blocks completion as a compiler defect rather than
    becoming an application diagnostic.
16. Final performance reports include every framework, common metric, and requested percentile.

## Risks and controls

**Generated-code growth:** direct code can duplicate small operations. Keep focused operations
shared, measure raw and compressed bytes, and select template or direct creation per component.

**Function-count growth:** do not emit wrapper or no-op functions per component. Reuse shared
defaults, combine mount/hydrate claims where practical, and keep generated functions top-level.

**Prop-receipt overhead:** do not allocate tuple arrays, partial props objects, string-key maps, or
per-receipt closures in the generated hot path. Use compact prop identities, reuse the instance's
indexed publication state, and batch all supplied values before applying work. Compare child-local
encodings across local, imported, finite, and lazy composition, and report their update CPU, code
size, allocation, and retained state against the fixed baseline.

**Compiler complexity:** organize analysis, artifact planning, client emission, server emission, and
diagnostics as separate owned modules. Do not encode target matrices in one lowering function.

**Dynamic-source pressure:** preserve currently valid dynamic source by emitting focused operations
that select already compiled artifacts or reconcile compiler-produced values. Distinguish that
authored dynamism from arbitrary foreign functions and objects, which retain their existing explicit
boundaries. Do not restore a universal fallback or manufacture native component identity at runtime.

**Hydration correctness:** remove markers only after the component artifact owns an equally stable
claim or range identity. Preserve focused controls and authoritative root recovery.

**Server concurrency:** immutable artifacts must never retain frames, requests, signals, tasks, or
loggers. Test overlapping requests and failure cleanup adversarially.

For compiler-proven synchronous JSX roots, the server implementation may return its prepared
component-local program directly and identify that closed execution form in immutable artifact
metadata. The request executor owns setup, sink commitment, checkpoints, hooks, and disposal; it
must not recreate the removed returned-render closure or synchronous issued-result projection.
Forwarded or arbitrary output continues through the component-local callable contract until the
compiler proves a closed lowering, and scheduled work keeps its distinct request-owned protocol.

**Compatibility leakage:** React and plugin code must have explicit package roots and bundle tests.
A native component capability bit is not permission to import an entire compatibility runtime.

## Rejected alternatives

### Whole-tree compiler closure as the execution foundation

Rejected. It breaks ordinary module and package composition, duplicates knowledge already owned by
child artifacts, and is unnecessary when every component implements a stable ABI. Whole-tree
linking remains an optional optimization.

### Universal renderer with more fast paths

Rejected. It keeps classification, fallback reachability, generic allocation, and ambiguous
completion criteria. Valid native source must receive complete target lowering; independently
invalid values fail through their existing diagnostics rather than selecting generic execution.

### One application-wide render tape

Rejected. It weakens component ownership, complicates libraries and lazy loading, and makes local
artifacts depend on final application topology. Compact tables remain valid inside a component.

### Runtime recompilation or TypeScript execution

Rejected. Applications and libraries ship compiled target artifacts. The compiler is a build-time
requirement, not a browser or request-time dependency.

### React components as native renderer inputs

Rejected. React ownership belongs inside a precompiled native island. The native parent calls the
island ABI and never interprets a React value.

### Backward-compatible artifact adapters

Rejected. eXact has no external compatibility obligation. Repository consumers migrate with the
ABI, and obsolete artifacts fail clearly.

## Completion definition

This proposal is complete only when every supported native component executes exclusively through
its component-local target ABI in every supported runtime mode; all repository applications and
published-library fixtures use that path; React compatibility is contained by precompiled native
islands; generic native client and server execution has been removed; structural reports prove no
fallback reachability; every currently valid source form remains supported; all correctness checks
pass; and the complete comparison suite records the result without unexplained regressions.
