# Compiler-planned structural refresh

## Status

Proposed after
[`recursive-server-client-graph-partitioning.md`](../history/recursive-server-client-graph-partitioning.md),
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md),
[`server-component-library-trust.md`](../history/server-component-library-trust.md),
resolution or explicit rejection of
[`cooperative-structured-children.md`](cooperative-structured-children.md),
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md),
[`component-value-callback-bindings.md`](../history/component-value-callback-bindings.md), and
[`lazy-interaction-islands.md`](lazy-interaction-islands.md). Structural plans must consume the
settled activator-selected enhancement component groups, bundler-authorized server component graph,
bounded root-bearing frames, target generations, and activation containment rather than encode the
current unrestricted enhancement target walk. The compiler emits structural facts for all reachable
components without making trust decisions; bundlers admit only authorized server implementations.
Translated message branches and structural slots must remain within their compiler-emitted message
plans and active locale/catalog generation.
The accepted
[`compiler-owned-render-programs.md`](../history/compiler-owned-render-programs.md),
[`bounded-deterministic-async-ssr.md`](../history/bounded-deterministic-async-ssr.md), and
[`compact-hydration-publication.md`](../history/compact-hydration-publication.md) proposals are implemented
first. Structural refresh reuses their slot, range, deterministic identity, compiled-cursor, and
publication contracts while retaining its documented generic parser/differ and authoritative
boundary-replacement fallbacks.
The current SSR refresh path supports text, properties, styles, keyed lists, compiler-stable dynamic
ranges, nested element replacement, and authoritative boundary replacement. Its safe HTML differ
still rediscovers some authored structure from serialized HTML.

| Delivery area        | Current state                                 | Proposed state                                         |
| -------------------- | --------------------------------------------- | ------------------------------------------------------ |
| Refresh strategy     | Boundary option plus runtime HTML analysis    | Compiler-emitted structural plan                       |
| Shape ownership      | Recovered from markers and serialized HTML    | Explicit expression, branch, list, and range ownership |
| Normal fallback      | Fine-grained diff when runtime proof succeeds | Execute the plan, validate, then fall back locally     |
| Boundary replacement | Correctness escape hatch                      | Retained correctness escape hatch                      |

## Decision

Emit a structural refresh plan with each refreshable compiler boundary. The plan describes the
smallest safe mutation units the compiler can prove from source. The server renderer evaluates the
next result against that plan; the client validates returned patches and retains authoritative
boundary replacement when plan execution or validation cannot prove safety.

An internal plan is equivalent to:

```ts
type StructuralRefreshPlan =
	| { readonly kind: 'text'; readonly target: ExactNodeId }
	| {
			readonly kind: 'properties';
			readonly target: ExactNodeId;
			readonly names: readonly string[];
	  }
	| { readonly kind: 'dynamic-range'; readonly target: ExactRangeId }
	| { readonly kind: 'keyed-list'; readonly target: ExactListId }
	| {
			readonly kind: 'conditional';
			readonly target: ExactRangeId;
			readonly branches: readonly ExactBranchContract[];
	  }
	| { readonly kind: 'element'; readonly target: ExactNodeId }
	| { readonly kind: 'boundary'; readonly target: ExactBoundaryId };
```

These names describe the design, not a public application API.

## Goals

- Use compiler knowledge of expression ownership, branches, keyed identity, shape changes, and
  partition containment instead of reconstructing it from HTML.
- Make conditional replacement, fragment insertion/removal, sibling changes, registry selection,
  nested server slots, Suspense, and Activity precise.
- Plan through active enhancement components as ordinary component roots, including transparent and
  structural output, activator-selected co-targeted groups, bounded root-bearing frames, and
  enhancement-target generation changes.
- Preserve unaffected DOM nodes, component instances, focus, form state, refs, and owned resources.
- Keep runtime validation and range-local fallback as independent protection.
- Keep the plan deterministic, bounded, and free of source text or executable callbacks.

## Non-goals

- Eliminating HTML parsing for every server-rendering path.
- Sending compiler IR, AST nodes, closures, or bundler module paths to the browser.
- Applying patches outside the authorized execution root and partition generation.
- Replacing ordinary client reactivity with server refresh.
- Guaranteeing a fine-grained patch when authored output is opaque or structurally unbounded.

## Plan ownership

The native compiler owns plan generation after placement and JSX structure are resolved. A plan is
attached to the same build-scoped boundary contract that owns refresh authorization. IDs refer only
to compiler-emitted nodes, ranges, lists, branches, and nested partition edges.

Plans must encode:

- the expression or structural construct owning each target;
- the allowed patch kinds and property names;
- branch identities and the range that contains every branch;
- keyed-list identity and item containment;
- nested partition boundaries that may refresh independently;
- Suspense and Activity retention/readiness constraints;
- first-root path and root-bearing-frame identity wherever an enhancement target can change, plus
  direct `_` enhancement-boundary identity where no target search occurs; and
- the nearest authoritative fallback boundary.

Active enhancement components are ordinary component owners in this plan. The compiler must retain
each activator-selected canonical component root separately from the intrinsic enhancement target,
preserve shared-prop recipients and context-derived same-target ordering, and represent transparent
or structural output with the same range ownership rules as any other component. The plan treats a
direct intrinsic declaration as terminal and limits component-declaration alternate-root authority
to the first root-bearing logical output frame. It cannot authorize a patch through an opaque nested
component frame merely because that frame is a DOM descendant.

For an enhancement authored directly on `_`, the active component chain is itself the fragment
boundary. The plan retains that boundary and its generation without inventing a selected intrinsic,
and structural replacement releases or reconstructs the chain through ordinary component and range
ownership.

Internationalized message plans add only compiler-authorized text, selector cases, formatted-value
slots, and movable structural fragments. A translated refresh may select or reorder those declared
units under the active locale/catalog generation, but cannot introduce an undeclared component,
attribute, URL, handler, or range. Unit conversion occurs before the plan validates the formatted
text/parts publication; it never changes the component's stored source measurement.

A first-root-path, root-bearing-frame, or selected-intrinsic replacement releases the old
enhancement generation through ordinary component lifecycle before activating or adopting the new
generation. The runtime must not patch through an enhancement instance as if it were only element
metadata or reuse authority from the previous frame generation.

Plan metadata belongs in server artifacts and compact client boundary contracts only where needed
for validation. Rich source explanations remain server-side inspection data.

## Server execution

The server renders or evaluates the targets required by the plan and compares typed structural
results rather than asking a generic HTML differ to infer all ownership. It emits the narrowest
validated patch sequence within configured count and size budgets.

If the current contract, previous snapshot, next result, or nested identity does not match the plan,
the server emits one replacement for the nearest safe range. A malformed or internally inconsistent
plan fails closed; it does not relax to an unvalidated patch.

The existing HTML differ remains useful for unplanned boundaries, compatibility, and validation
evidence during migration. It should not become a second source of placement or ownership truth.

## Client validation and application

The client validates build identity, execution root, boundary generation, patch kind, target kind,
containment, ordering, and resource budget before mutation. Patch application prepares the complete
batch before publishing visible changes where practical.

Structural removal must release component roots, task generations, event ownership, refs,
enhancement components, and retained ranges through their normal lifecycle. Insertions adopt or mount only
under compiler-owned markers. A nested failure replaces its authorized range rather than continuing
with a partially applied sibling sequence.

## Performance and working-set constraints

Structural planning should remove runtime rediscovery costs rather than add a second complete view
of the rendered tree. It must follow
[`javascript-performance-improvements.md`](javascript-performance-improvements.md):

- client contracts contain compact target, kind, containment, and generation data only; rich source
  ranges, explanations, and compiler graph objects remain in build/server inspection artifacts;
- server execution evaluates typed plan targets into bounded scratch records and releases previous
  snapshots, next snapshots, parse trees, and patch candidates after publication;
- planned keyed updates should use one backing snapshot representation with item offsets instead of
  retaining boundary HTML, inner HTML, and item HTML simultaneously;
- the generic HTML parser/differ remains a fallback and must not run or allocate full previous/next
  trees when the validated plan is sufficient;
- client validation streams or indexes the patch batch without cloning payload HTML or rebuilding a
  parallel mounted/VNode tree; and
- plan caches are keyed by immutable build contract and bounded independently from request data.

Structural plans should reuse the compiler render plan's text/property/branch/range identities and
the reactive keyed-list delta representation. The server can then evaluate and write typed results
without first producing complete previous/next HTML, and the client can apply the same authorized
delta without rebuilding a generic child reconciliation plan. The generic HTML parser/differ remains
measured fallback work, never an unconditional validation pass after a typed plan already proved the
same structure.

Benchmarks must include peak server heap for large text, branch, and keyed-list refreshes; client
allocation and mutation-to-paint during patch validation/application; server CPU and response bytes;
and release after rejected, stale, and fallback plans. Compare compressed bytes and end-to-end
latency against authoritative boundary replacement, not only patch count.

## Priority cases

Implement in this order:

1. Conditional branch replacement.
2. Fragment and multiple-sibling insertion/removal.
3. Component-registry selection changes.
4. Nested server-slot refreshes derived from recursive partitions.
5. Suspense reveal/replacement and Activity park/resume structure.
6. Enhancement first-root-path, root-bearing-frame, and selected-target rerouting; direct `_`
   enhancement-boundary replacement; and transparent or structural enhancement output.

## Verification

- Compiler tests assert semantic plans and target containment rather than exact generated text.
- SSR tests compare planned patches with complete rerenders across branch, fragment, sibling, list,
  registry, nested-slot, Suspense, and Activity transitions.
- DOM tests protect identity, focus, form state, refs, event handlers, cleanup, and enhancement
  component roots.
- Enhancement tests protect activator grouping, shared-prop recipients, ordinary component identity,
  same-target context ordering, bounded root-frame authority, task cancellation,
  transparent/structural output, target rerouting, and generation-fenced cleanup.
- Adversarial protocol tests reject unknown targets, wrong kinds, cross-boundary IDs, stale
  generations, excessive patches, and malformed branch/list operations.
- Differential/property tests generate bounded structural transitions and compare the final DOM with
  authoritative boundary replacement.

## Acceptance criteria

1. Every planned target has one compiler-owned structural owner and containment range.
2. Priority structural changes normally avoid replacing unaffected sibling ranges.
3. Client and server independently validate plan and patch authority.
4. Lifecycle cleanup remains identical to ordinary renderer-owned removal.
5. Unproven or invalid transitions fall back to the nearest authoritative boundary replacement.
6. The plan contains no application closures, source text, secret values, or public bundler paths.
7. Active enhancement components remain ordinary planned component roots and cannot be bypassed by a
   patch targeting their intrinsic enhancement target or an opaque nested component frame.
