# Compiler-owned render programs

## Status

Implemented. Compiler-finite intrinsic regions now use branded, revision-cached programs across
markerless SSR, DOM mounting, patching, and markerless hydration. The executor covers HTML, SVG,
MathML, scalar text, finite properties and attributes, classes, styles, URLs, ordinary form
controls, events, and refs by reusing the generic host operations. Program roots participate in
component-root publication and release static as well as reactive host ownership. Marker-bearing,
structural, enhancement-routed, opaque-spread, raw-content, and otherwise unproven regions retain
the region-local generic fallback by design; no partially supported host semantics remain.

This proposal implements the accepted render-plan experiment in
[`javascript-performance-improvements.md`](../proposals/javascript-performance-improvements.md). It follows the
delivered component, enhancement, binding, partition, and component-library trust contracts. It
must land before bounded async SSR, compact hydration publication, lazy interaction islands,
structural refresh, partial-prerender resumption, or final adapter parity consumes render-slot
identity.

## Decision

The native compiler emits an internal, target-neutral render program for the JSX regions whose
shape it can prove. The program identifies static structure and typed reactive slots once. SSR,
client mounting, and hydration compile that logical program into target-specific execution without
making the plan or its opcodes a public component/VNode API.

Every planned region also carries a lazy generic fallback. Unsupported syntax, a failed runtime
precondition, a hydration mismatch, or an unknown program version enters the existing VNode path at
the smallest owning region. Application components remain setup-once component instances and
retain ordinary state, props, tasks, contexts, lifecycle, refs, enhancements, and inspection.

## Internal contract

The initial artifact contract is equivalent to:

```ts
type ExactRenderProgram = Readonly<{
	version: 1;
	id: string;
	namespace: 'html' | 'svg' | 'mathml';
	template: string;
	parts: readonly string[];
	slots: readonly ExactRenderSlot[];
	nodes: readonly ExactRenderNode[];
}>;

type ExactRenderSlot = Readonly<{
	id: string;
	kind: 'text' | 'property' | 'attribute' | 'style' | 'class' | 'url';
	path: readonly number[];
	name?: string;
}>;

type ExactRenderNode = Readonly<{
	id: string;
	path: readonly number[];
	tag?: string;
	namespace: 'html' | 'svg' | 'mathml';
}>;
```

These names describe compiler/runtime ownership, not stable exported TypeScript types. Emitted
artifacts may encode paths and kinds as compact tuples after semantic tests prove equivalence.
Rich source ranges and explanations remain in inspection artifacts, never in client programs.

The compiler emits a branded planned result containing a stable semantic program identity, a
source-revision cache key, a lazy factory that constructs the immutable program once per revision,
the current invocation's slot readers, and a lazy fallback function. It does not allocate another
program descriptor or eagerly construct the fallback VNode tree for each component instance, and
HMR cannot reuse a stale descriptor after the planned region changes.
Renderers reject unbranded authored lookalikes.

## Eligibility and fallback

The first production subset includes intrinsic HTML structure, static text, compiler-owned dynamic
text cells, and finite property/attribute/style/class/URL slots. Eligibility is region-local.
A containing component can therefore use planned intrinsic regions around generic children without
forcing the whole component into either path.
Compiler-owned regions nested beneath intrinsic SVG or MathML elements retain that source-known
namespace even when a structural expression extracts the region into its own program. Programs
whose insertion namespace is component-defined remain on the generic path.

The compiler uses the generic path for:

- components and dynamic component selection not represented by a nested program edge;
- opaque spreads or property names;
- portals, unsafe HTML, React-owned values, and custom renderers;
- Suspense, Activity, server boundaries, server slots, keyed lists, and structural branches until
  their dedicated program forms land;
- enhancement routing whose active component/root-bearing frame is not statically bounded; and
- any namespace, custom-element, form-control, event, ref, or inspection relationship whose target
  executor has not implemented the complete current contract.

Fallback is a supported execution mode, not a development-only recovery. It must preserve the same
compiler IDs and nearest ownership boundary so a planned parent and generic child compose without
duplicate instances or ranges.

## SSR executor

The SSR executor writes template constants and escaped slot values directly into the request-owned
writer. It applies the existing DOM property/attribute, URL, style, namespace, raw-content, marker,
output-limit, React-markup, and resource-hint rules. Byte accounting occurs as chunks are encoded;
the executor does not build a VNode tree or encode a completed string solely to measure it.

Synchronous and asynchronous SSR use the same program and slot identities. Async components still
stabilize their task-owned state before publication. A slot read that suspends, throws, changes
shape, or violates its declared kind transfers control to the owning generic fallback before that
region publishes bytes.

## Client mount executor

The client caches one inert template per program identity and document/namespace implementation.
Mount clones that template, resolves compiler paths with a bounded cursor, installs the existing
property and event semantics, and creates only the ownership records needed by dynamic slots,
components, refs, or lifecycle. Static nodes do not gain duplicate VNodes or permanent per-node
watchers merely because they came from a plan.

Slot readers run inside ordinary renderer-owned reactive scopes. Updates call the same DOM property,
style, URL, form-control, delegated-event, ref, focus, and cleanup operations used by generic
mounting. A structural change exits through the nearest generic or later structural-program edge;
it never mutates beyond the planned range.

## Hydration executor

Hydration walks the existing DOM and program in one bounded cursor. It validates tag, namespace,
required static attributes, marker/range ownership, and slot target kind while creating mounted
ownership. It preserves matching node identity and dirty form state. Mismatch recovery replaces the
smallest safe planned region through the generic fallback and releases partially acquired scopes,
handlers, refs, and nodes first.

The cursor is reusable by compact hydration publication and later structural refresh. It does not
require `data-exact-id` on every intrinsic when the program path and surrounding range prove the
same identity. IDs remain where patching, inspection, server ownership, or an unplanned descendant
needs direct lookup.

## Enhancements and `_target`

Enhancement components remain ordinary component instances. A direct intrinsic enhancement target
can use a planned host node only when its compiler identity and generation are explicit. Planned
component output publishes the same first root-bearing frame and `_target` selection as the generic
renderer. `_target` contribution merging completes before the planned host applies properties.

Transparent or structural enhancement output, activator-selected groups, selector changes, and
root-frame changes use generic boundaries until their program edge can preserve ordinary ownership,
same-target ordering, collision diagnostics, and generation-fenced cleanup.

## Inspection and versioning

DevTools observes the same component, cell, task, and DOM identities regardless of executor. A
planned static node may be reconstructed from program identity plus path instead of retaining a
VNode. Source explanations are joined through build-side catalogs. Unknown versions fail closed to
the generic artifact; no plan opcode becomes durable server protocol identity.

## Implementation order

1. Add the branded internal planned-result and immutable program contracts to core.
2. Emit semantic program facts and lazy VNode fallback for the initial intrinsic/text subset.
3. Implement direct bounded SSR writing and exact-output differential tests.
4. Implement HTML template mounting with ordinary reactive slot ownership.
5. Implement compiled hydration cursor adoption and range-local fallback.
6. Add namespaces, finite properties, styles, classes, URLs, form controls, events, and refs only
   after their focused semantic suites pass.
7. Integrate inspection identity, enhancement target publication, and mixed planned/generic roots.
8. Expose program capability facts to later async SSR, hydration publication, islands, refresh,
   resumption, and adapters without exposing the opcode representation.

## Verification

- Compiler semantic tests compare program nodes, slot ownership, and fallback boundaries rather
  than generated helper spelling.
- Differential SSR tests compare exact output, escaping, markers, byte limits, resource hints, and
  errors with generic rendering.
- DOM tests compare node identity, updates, events, refs, focus, form state, namespaces, custom
  elements, teardown, Activity, Suspense, unsafe HTML, and enhancement routing.
- Hydration tests cover matching adoption, dirty controls, malformed paths, missing/extra nodes,
  range-local replacement, early interaction, and partial-construction cleanup.
- Artifact tests prove target splitting, tree shaking, deterministic programs, generic fallback,
  and absence of source text or server-only values from client output.

The production-path 500-row markerless SSR workload emits identical 9,903-byte output. The final
August 6, 2026 tracked five-process run measured a 19.79x median CPU improvement and reduced
focused peak heap from 12,456,752 to 115,512 bytes. Client mount and hydration
must improve or remain within 3% of generic medians for each newly eligible category; raw, gzip,
Brotli, startup, update, and retained-heap counter-metrics are mandatory.

## Acceptance criteria

1. Planned and generic execution are observably equivalent for every eligible construct.
2. Unsupported or mismatched regions fall back locally without duplicate setup or ownership.
3. SSR, mount, hydration, refresh, and inspection share compiler slot/node identities.
4. Static planned nodes avoid generic VNode and watcher allocation.
5. Component, task, context, ref, event, form, enhancement, and cleanup semantics remain ordinary.
6. Plans contain no source text, secrets, application closures beyond slot readers, or public
   bundler paths.
7. The measured CPU/heap gain survives production compiler output and Chromium verification.
