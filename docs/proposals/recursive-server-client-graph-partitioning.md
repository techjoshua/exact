# Recursive server/client graph partitioning

## Status

Implemented for the first delivery in native protocol 1.27 and generated component-contract
version 2. The native compiler emits the build-scoped normalized plan, paired artifacts consume its
reachability and range contracts, and SSR, hydration, refresh dispatch, language tools, and DevTools
share its partition identities. Conditional branches and keyed items carry instance-local
discriminators and generations. Boundary replacement remains the range-local correctness fallback;
it is no longer the ordinary representation for independently provable server descendants.

Changes to the ownership, identity, data-boundary, or fallback rules in this document require an
explicit proposal amendment rather than an implementation-local approximation.

| Delivery area                          | Implemented contract                                      |
| -------------------------------------- | --------------------------------------------------------- |
| Semantic representation                | Build-scoped partition plan graph                         |
| Runtime representation                 | Nested, acyclic range instances with exact authority      |
| Server children inside a client island | Independent nested server ranges                          |
| Conditional and keyed placement        | Branch- and item-local discriminators and generations     |
| Artifact reachability                  | Partition-derived target reachability                     |
| Component ownership                    | Durable component ownership separate from range authority |
| Enhancements                           | Ordinary component nodes in every partition projection    |

This proposal is the prerequisite for
[`lazy-interaction-islands.md`](lazy-interaction-islands.md),
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md), and
[`partial-prerender-resumption.md`](partial-prerender-resumption.md).

## Decision

Replace broad server-child fallback planning with two related representations:

1. A **partition plan graph** is a build-scoped compiler contract. It contains reusable component
   and render-region templates and may contain cycles through recursive component references.
2. A **partition instance tree** is a runtime projection for one execution root. It is acyclic and
   contains the mounted component instances, selected branches, keyed items, enhancement instances,
   rendered ranges, and task/readiness relationships that actually exist.

The compiler partitions only where it can prove placement, data transfer, structural containment,
and lifecycle preservation. Uncertainty broadens the narrowest affected render region and produces
an explanation. It never silently transfers server-only data or invents a client callback proxy.

For example:

```text
client component instance: Workspace
├── client region: button
├── server range: summary
└── client component instance: Controls
    └── server range: permissions
```

The summary and permissions ranges have independent refresh authority and generations. Neither
makes unrelated siblings server-owned, and both remain descendants of their authored durable
component owners.

## Goals

- Represent alternating client/server descendants without flattening them into a broad slot.
- Preserve multiple independent server ranges beneath one client region.
- Partition conditional, keyed, Suspense, Activity, and finite component-registry structure.
- Include active enhancement components as ordinary component nodes with their own contexts, tasks,
  lifecycle, root generation, and cleanup.
- Derive artifact reachability, SSR markers, hydration ownership, refresh containment, and
  inspection facts from the same semantic plan.
- Keep generated plan, instance, operation, and boundary identities opaque outside framework
  transport.
- Explain the source edge and conservative rule responsible for every placement transition or
  unsplit region.

## Non-goals

- A new application-authored boundary component or placement DSL.
- A second owner for component state, tasks, contexts, resources, or lifecycle.
- Serializing server contexts, secrets, closures, component instances, VNodes, or arbitrary
  children.
- Inferring native ownership for React or another unbranded foreign value.
- Removing range-local replacement, hydration mismatch recovery, or application error boundaries.
- Persisting partial prerenders; that is a dependent proposal.
- Stable partition identity across different builds.

## Static partition plan

The compiler emits an internal plan equivalent to the following normalized graph. The TypeScript
shape is explanatory; the native compiler owns the actual representation.

```ts
type ExactPartitionPlan = {
	readonly version: number;
	readonly buildKey: string;
	readonly roots: readonly ExactPartitionPlanId[];
	readonly nodes: Readonly<Record<ExactPartitionPlanId, ExactPartitionPlanNode>>;
	readonly edges: Readonly<Record<ExactPartitionEdgeId, ExactPartitionEdge>>;
};

type ExactPartitionPlanNode = {
	readonly id: ExactPartitionPlanId;
	readonly kind:
		| 'component'
		| 'enhancement-component'
		| 'region'
		| 'conditional-template'
		| 'keyed-template'
		| 'readiness-boundary';
	readonly componentContract?: string;
	readonly ownerComponent: ExactPartitionPlanId;
	readonly placement: ExactPlacementRequirement;
	readonly artifactTargets: readonly ('client' | 'server')[];
	readonly activation: 'server-only' | 'eager' | 'interaction' | 'inert';
	readonly refreshAuthority: 'client' | 'server' | 'none';
	readonly sourceRange: ExactSourceRange;
	readonly renderPath: readonly ExactRenderSegment[];
	readonly childEdges: readonly ExactPartitionEdgeId[];
};

type ExactPlacementRequirement = 'client' | 'server' | 'either';

type ExactPartitionEdge = {
	readonly id: ExactPartitionEdgeId;
	readonly parent: ExactPartitionPlanId;
	readonly child: ExactPartitionPlanId;
	readonly kind:
		| 'component'
		| 'enhancement'
		| 'region'
		| 'branch'
		| 'keyed-item'
		| 'server-range'
		| 'client-range'
		| 'readiness';
	readonly cardinality: 'one' | 'optional' | 'branch' | 'many-keyed';
	readonly data: readonly ExactPartitionDataSlot[];
	readonly fallback: ExactPartitionPlanId;
};
```

The plan is a graph, not a tree. A component contract has one reusable plan root even if many
render edges reference it. Recursive component references form strongly connected components in
the plan graph and do not require recursive plan expansion.

### Placement and execution phases

`placement` is a semantic environment requirement:

- `client` requires browser/client execution;
- `server` requires server execution; and
- `either` contains no environment requirement and may be selected for either artifact.

There is no `shared` runtime placement. Sharing is an artifact decision represented by
`artifactTargets: ['client', 'server']`. One runtime partition instance always executes on one
concrete host during a phase.

`activation` describes the live browser contract independently from initial SSR:

- `server-only` never creates a live browser instance;
- `eager` hydrates during ordinary root activation;
- `interaction` uses compiler-approved deferred activation; and
- `inert` remains server-rendered markup with no client component activation.

SSR may execute an `either` or client-artifact component to produce initial HTML without changing
its live activation contract. `refreshAuthority` identifies which host may originate authoritative
updates after initial rendering; it does not own application state.

### Node and component ownership

Every durable native component is represented by a `component` plan node. Every active attributed
enhancement is represented by an `enhancement-component` node with the same ordinary component
contract. Region, branch, keyed, and readiness nodes describe execution or structural authority;
they are not component instances. A component or enhancement-component node names itself as its
`ownerComponent`; every structural descendant names the nearest durable component node.

Component instances continue to own:

- `this.state`, props, contexts, refs, and lifecycle registrations;
- task definitions, task generations, optimistic journals, and owned resources;
- enhancement contexts and same-target ordering; and
- component error and cleanup behavior.

Partition region instances own only framework authority:

- an executable artifact region and concrete host for the current phase;
- a rendered or inert DOM/HTML range;
- serialization and operation containment;
- hydration, refresh, and replacement generations; and
- references to component/task/readiness owners relevant to that range.

A partition can index or authorize task and readiness relationships but never becomes their owner.
Replacing a region asks the ordinary component/task lifecycle to release affected owners.

### Enhancement components

An attributed marker is only capability declaration, reactive props, and target-selection input.
Once activated, the enhancement instance is an ordinary component node separate from its intrinsic
enhancement target. Partition planning must:

- include transparent and structural enhancement output;
- preserve context-derived ordering for enhancements sharing a target;
- retain each enhancement component root and target generation independently;
- preserve Activity, task, error, and cleanup ownership; and
- release a rerouted or replaced target generation through ordinary component unmount.

An active enhancement is never flattened into element metadata. An unavailable optional capability
creates no enhancement instance and leaves the underlying target under its ordinary owner. Required
behavior continues to use an explicit component surface.

## Partition minimality

The compiler walks resolved render structure in source order. Adjacent region candidates coalesce
if and only if all of the following are equal or compatible:

1. placement requirement and selected artifact targets;
2. durable component owner;
3. activation and refresh authority;
4. serialization direction and data policy;
5. readiness/Suspense and Activity retention owner;
6. keyed, conditional, registry-selection, and replacement containment;
7. enhancement component and enhancement-target generation;
8. error-boundary and cleanup containment; and
9. the nearest authoritative fallback range.

A component or enhancement-component node is never coalesced away. A conditional, keyed list,
registry selection, readiness boundary, or placement transition always retains a distinct template
when its alternatives differ in placement, activation, refresh authority, or lifecycle. Static text
and adjacent intrinsic structure may coalesce when all nine conditions match.

This rule produces maximal compatible regions deterministically. Source order is the final stable
tie-breaker; compiler map iteration and bundler order cannot affect the result.

## Crossing-edge data contract

Each edge that crosses concrete hosts declares every value allowed across it:

```ts
type ExactPartitionDataSlot = {
	readonly id: string;
	readonly kind: 'prop' | 'state' | 'capture' | 'public-context' | 'server-context-name';
	readonly direction: 'client-to-server' | 'server-to-client' | 'host-resolved';
	readonly transfer: 'snapshot' | 'ordered-delta' | 'opaque-identity' | 'context-lookup';
	readonly policy: {
		readonly residency: 'client' | 'server' | 'either';
		readonly secret: boolean;
	};
};
```

The compiler derives slots from actual reads, writes, captures, contexts, and continuation effects.
Rules are:

- client-to-server input contains only compiler-selected public props, state paths, captures, and
  opaque operation/boundary identities;
- server-to-client output contains only validated public state/context effects and authorized
  render patches;
- server contexts use `host-resolved` / `context-lookup`: only their compiler-known names appear in
  the plan, and values are reacquired from the host rather than crossing the edge;
- secret-qualified or server-resident values never enter client artifacts, markers, snapshots,
  patches, inspection payloads, or diagnostics excerpts;
- callbacks and arbitrary JSX children never serialize across an edge;
- compiler-approved `Map` and `Set` values retain the existing tagged snapshot/delta contract; and
- every request and response is bounded and shape-validated before operation lookup or mutation.

Nested alternation does not widen authority. A server range can read only its declared incoming
slots and can update only its declared range or descendant ranges. It cannot address an ancestor or
independent sibling merely because they share a component owner.

## Runtime partition instances

The runtime materializes an acyclic instance tree equivalent to:

```ts
type ExactPartitionInstance = {
	readonly executionRoot: string;
	readonly plan: ExactPartitionPlanId;
	readonly ownerComponentInstance: string;
	readonly discriminator:
		| { readonly kind: 'single' }
		| { readonly kind: 'branch'; readonly branch: string }
		| { readonly kind: 'keyed'; readonly list: string; readonly keyToken: string };
	readonly generation: number;
	readonly host: 'client' | 'server';
	readonly children: readonly ExactPartitionInstance[];
};
```

The discriminator is framework-owned. A keyed `keyToken` is derived through the existing canonical
key contract and is never treated as an authored operation ID. Duplicate or unsupported keys fail
through existing keyed-list diagnostics and recovery.

Branch changes and keyed insertion/removal create or release runtime instances without modifying
the static plan. Recursive component calls create deeper runtime instances that reference the same
finite plan nodes. Runtime recursion remains bounded by ordinary application execution and renderer
limits.

## Identity and versioning

Plan-node and edge IDs derive deterministically from canonical module identity, component contract,
structural render path, and node/edge role. IDs are opaque, stable only within one exact build, and
independent of emitted filenames, chunks, minification, or bundler traversal order.

Runtime authority is the tuple of:

- exact build key;
- execution-root identity;
- plan-node or edge ID;
- owner component instance;
- branch/key discriminator when present; and
- current generation.

SSR markers are emitted only for ranges or component contracts needed by hydration, refresh,
resumption, or mismatch recovery. Ordinary enhancement component markers use the same component
contract and ownership rules as other components. Rich plan graphs and source evidence stay in
server artifacts and inspection catalogs; the client receives only compact identities required for
adoption and validation.

This delivery introduces a new partition-contract version and increments the compiler native
protocol, compiled component-contract version, SSR marker contract, hydration registration contract,
and server invocation/refresh contract together. Mixed versions fail before adoption or dispatch.
There is no compatibility translation for pre-partition internal artifacts.

Inspection IDs remain explanatory correlation values. Only compiler-generated operation and range
contracts accepted under the exact build/execution-root/generation tuple authorize dispatch or DOM
mutation.

## Graph closure and unknown code

Placement analysis runs to a fixed point across the complete configured TypeScript project before
lowering. Module and component strongly connected components settle together. Lazy finite registry
entries participate through their statically resolved component contracts even when their client
artifacts remain separate chunks.

Published native eXact packages participate through compiler-branded component contracts that
declare placement, public data effects, enhancement context effects, and artifact reachability.
Compilerless libraries may participate only through the existing explicit native component and
task contracts; the compiler does not inspect unavailable implementation bodies.

Unknown or foreign values follow one conservative rule:

- an explicitly configured compatibility adapter owns the value and becomes one opaque component
  boundary under that adapter's placement contract; otherwise
- the compiler keeps the narrowest enclosing region unsplit and emits a diagnostic explaining the
  unresolved value and the resulting placement/activation consequence.

React-owned values remain behind the explicit React compatibility boundary. Runtime registration,
arbitrary loader tables, and authored casts cannot manufacture a native partition contract.

## SSR, hydration, refresh, and cancellation

SSR walks the runtime instance tree and emits narrow range markers for crossing edges. Server-only
ranges render in place beneath their logical component owners. Client regions receive the existing
state/capture snapshots required by their declared activation policy.

Hydration reconstructs a partition instance only after the build, execution root, plan, component,
discriminator, and range marker match. Compatible ancestors and siblings continue adopting when a
nested range mismatches. The mismatched range mounts fresh or receives authoritative replacement
according to its fallback contract.

Refresh requests identify one declared server-authoritative edge and current generation. The server
may return patches only for that range or compiler-declared descendants. The client validates the
complete patch batch before mutation. Cross-root, cross-range, stale-generation, and containment
violations fail closed.

Cancellation and disposal continue to follow durable component instances and structured task
frames. Replacing one region cancels and cleans only task/resource owners contained exclusively by
that region. An owner shared with surviving sibling regions remains alive; its work is cancelled only
when its ordinary generation or component lifetime requires it.

## Failure and fallback policy

### Compile time

If splitting cannot prove placement, serialization, identity, or lifecycle preservation, the
compiler broadens only the nearest affected region until the proof succeeds. Server-only or secret
data that would enter a client artifact is always an error, never a broadening opportunity.

Diagnostics name the source edge, unresolved contract or policy, resulting broader region, artifact
and hydration consequence, and the safest source-level correction when one exists.

### Runtime

The client or server rejects an operation before mutation when plan version, build, execution root,
component contract, discriminator, generation, containment, or payload validation fails. Recovery is
the narrowest authoritative range replacement whose contract still matches. If no nested fallback
matches, recovery proceeds through the owning component or root mismatch policy.

No runtime failure may leave a partially published patch batch or a partially constructed ownership
graph. An unavailable optional enhancement remains inactive; an enhancement recorded as active in a
matching retained contract must be reconstructed completely or its containing range is replaced.

## Diagnostics and inspection

Language tools and DevTools expose the plan and live instance tree as related projections. They show:

- placement requirement, selected host/artifacts, activation, and refresh authority;
- component owner, including ordinary enhancement components;
- the dependency, context, API, task policy, or child edge that forced placement;
- values authorized across each crossing edge without revealing secret values;
- branch/key/readiness and fallback containment;
- eager or interaction hydration eligibility; and
- the conservative rule responsible when a region remains broad.

Inspection identities remain build-scoped and read-only, never dispatch capabilities.

## Normative semantic fixtures

Implementation begins by encoding these fixtures in the native compiler corpus. Expected results
assert semantic plans, artifacts, diagnostics, and runtime containment rather than generated source
text. Names below are descriptive; assertions use opaque fixture-local IDs.

### 1. Independent sibling server ranges

```tsx
<ClientShell>
	<ServerSummary />
	<button onClick={edit}>Edit</button>
	<ServerPermissions />
</ClientShell>
```

Expected: one client component node, two independent server-range edges, and one client region for
the button. Neither server range contains the other or the button.

### 2. Recursive alternation

```tsx
<ClientShell>
	<ServerPanel>
		<ClientControls>
			<ServerPermissions />
		</ClientControls>
	</ServerPanel>
</ClientShell>
```

Expected: client → server → client → server instance ancestry, four ordinary component owners, and
separate crossing-edge data slots at each host transition.

### 3. Conditional placement

```tsx
{
	this.state.mode === 'remote' ? <ServerReport /> : <LocalReport />;
}
```

Expected: one conditional template with distinct server and client branch edges. Selecting a branch
creates only that runtime instance and releases the prior branch through ordinary lifecycle.

### 4. Keyed mixed placement

```tsx
{
	items.map((item) =>
		item.remote ? <ServerRow key={item.id} item={item} /> : <LocalRow key={item.id} item={item} />
	);
}
```

Expected: one keyed template, branch-local server/client plans, and runtime item instances
discriminated by canonical key tokens. Reordering retains compatible item/component identity.

### 5. Finite component registry

```tsx
const Current = Widget[this.state.kind];
return () => <Current />;
```

Expected: registry-key alternatives use their compiler-branded component contracts. A server entry
does not make client entries server-owned; lazy client entries retain separate artifact chunks.

### 6. Suspense and Activity

```tsx
<Activity mode={this.state.visible ? 'visible' : 'hidden'}>
	<Suspense fallback={<Spinner />}>
		<ServerDetails />
	</Suspense>
</Activity>
```

Expected: Activity and readiness templates remain distinct containment nodes. Parking retains the
ordinary component and partition instances while removing active server task registration according
to current Activity/task contracts.

### 7. Transparent enhancement around a server range

```tsx
<section motion:apply={fade}>
	<ServerSummary />
</section>
```

Expected: an ordinary `MotionElement` enhancement-component node separate from the intrinsic
`section` target, with the nested server range beneath the correct logical owner. Transparent output
does not flatten the enhancement node.

### 8. Structural and co-targeted enhancements

```tsx
<article physics:body={body} gravity:apply={field} motion:layout>
	<ServerBadge />
</article>
```

Expected: ordinary enhancement-component nodes ordered by compiler-projected context effects,
separate component roots and one target generation, followed by the nested server range. Target
rerouting releases the old enhancement generations in reverse ordinary ownership order.

### 9. Server context and secret rejection

```tsx
const secret = this.getContext(SecretContext);
return () => <ClientChart token={secret} />;
```

Expected: a compile error identifying the secret/server-resident flow. No client artifact, marker,
snapshot, or broadened partition contains the value.

### 10. Unknown foreign child

```tsx
<ClientShell>
	<UnknownLibraryValue />
	<button onClick={edit}>Edit</button>
</ClientShell>
```

Expected: without an explicit compatibility/native contract, the narrowest region containing the
unknown value remains unsplit and receives a diagnostic. The independent button region remains as
narrow as ownership and structure permit.

### 11. Nested mismatch and sibling preservation

The server and client disagree on the selected permissions branch while the summary and controls
markers match.

Expected: hydration replaces or freshly mounts only the permissions fallback range. Summary DOM,
controls component state, enhancement instances, refs, focus, and sibling task generations survive.

### 12. Stale nested refresh

A response for permissions generation 4 arrives after generation 5 committed.

Expected: the entire response is rejected before DOM or state mutation. Summary and controls are
untouched, and generation 5 remains authoritative.

## Completed delivery order

1. Add normalized plan nodes, edges, data slots, reasons, and versioning to native semantic analysis
   without changing emitted artifacts.
2. Encode all normative fixtures and compare plan projections with current island/slot behavior.
3. Emit independent sibling server ranges beneath existing client islands.
4. Support nested alternation, conditional instances, keyed instances, registries, readiness, and
   Activity.
5. Integrate ordinary enhancement component plans and target generations.
6. Derive client, server, and dual-target artifact reachability and final client-bundle isolation from the
   plan.
7. Adopt plan/instance identities in SSR, hydration, refresh, language tools, and DevTools with the
   coordinated contract-version increment.
8. Remove the broad-children fallback only after recovery, security, and lifecycle parity passes.

## Verification strategy

- **Semantic fixtures:** the twelve normative cases plus cross-module, SCC, alias, spread, async,
  registry, and compilerless-contract variants.
- **Artifact isolation:** server-only imports and secrets are absent from every client entry and
  lazy chunk; client-only imports are absent from server execution artifacts where not required.
- **SSR and hydration:** compatible sibling DOM, component state, enhancements, form state, focus,
  refs, and tasks survive nested adoption, mismatch, and replacement.
- **Protocol security:** reject wrong build, root, plan, owner, discriminator, generation, edge,
  payload shape, size, and containment.
- **Lifecycle:** cancellation, Activity, Suspense, enhancement target changes, keyed removal,
  recursive unmount, and fallback replacement release exactly the owned resources.
- **Differential behavior:** complete boundary replacement and partitioned execution converge on the
  same observable DOM/state for generated bounded branch/key transition sequences.
- **Performance:** plan construction remains linear in analyzed nodes plus render edges after SCC
  formation; fixed-point work is bounded by the existing project graph. Record compiler time,
  emitted artifact size, initial client bytes, SSR time, hydration time, and retained DOM for the
  acceptance applications.

## Acceptance criteria

1. All twelve normative fixtures produce the accepted semantic plans and runtime containment.
2. A client component may contain multiple independently refreshable server ranges.
3. Client and server placement may alternate recursively without broadening unrelated siblings.
4. Conditional, keyed, registry, Suspense, and Activity structures retain the narrowest safe
   placement and stable authored component owners.
5. Active enhancement components remain ordinary owned component nodes and retain context order,
   tasks, Activity, target generation, error, lifecycle, and cleanup semantics.
6. One plan drives artifacts, SSR markers, hydration, refresh authority, diagnostics, and inspection.
7. Server-only and secret values remain absent from client artifacts and serialized boundary data.
8. Cross-host edges transfer only declared, validated data slots in the declared direction.
9. Static plan cycles and runtime keyed/branch multiplicity do not require unbounded plan expansion.
10. Runtime operations require the exact build/root/plan/owner/discriminator/generation authority and
    cannot address ancestors or independent siblings.
11. Unknown or foreign code follows the documented conservative boundary rule with an actionable
    diagnostic.
12. Nested mismatch, stale work, and invalid payloads fail before partial publication and recover at
    the narrowest matching authoritative range.
13. The coordinated compiler, component, SSR marker, hydration, and server protocol versions reject
    mixed artifacts deterministically.
14. Boundary replacement remains a range-local correctness fallback.
15. Representative acceptance builds never increase initial client reachability solely because a
    formerly broad server slot was split; any compiler-time or artifact-size regression is measured
    and justified against the narrower runtime contract.
