# Compiler-planned structural refresh

## Status

Proposed after
[`recursive-server-client-graph-partitioning.md`](recursive-server-client-graph-partitioning.md).
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
  structural output and enhancement-target generation changes.
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
- Suspense and Activity retention/readiness constraints; and
- the nearest authoritative fallback boundary.

Active enhancement components are ordinary component owners in this plan. The compiler must retain
their component root separately from the intrinsic enhancement target, preserve context-derived
same-target ordering, and represent transparent or structural output with the same range ownership
rules as any other component. A target reroute or replacement releases the old enhancement
generation through ordinary component lifecycle before activating or adopting the new generation;
the runtime must not patch through an enhancement instance as if it were only element metadata.

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

Structural removal must release component roots, task generations, event ownership, refs, plugin
enhancements, and retained ranges through their normal lifecycle. Insertions adopt or mount only
under compiler-owned markers. A nested failure replaces its authorized range rather than continuing
with a partially applied sibling sequence.

## Priority cases

Implement in this order:

1. Conditional branch replacement.
2. Fragment and multiple-sibling insertion/removal.
3. Component-registry selection changes.
4. Nested server-slot refreshes derived from recursive partitions.
5. Suspense reveal/replacement and Activity park/resume structure.
6. Enhancement target rerouting, transparent output, and structural enhancement replacement.

## Verification

- Compiler tests assert semantic plans and target containment rather than exact generated text.
- SSR tests compare planned patches with complete rerenders across branch, fragment, sibling, list,
  registry, nested-slot, Suspense, and Activity transitions.
- DOM tests protect identity, focus, form state, refs, event handlers, cleanup, and plugin roots.
- Enhancement tests protect ordinary component identity, same-target context ordering, task
  cancellation, transparent/structural output, target rerouting, and generation-fenced cleanup.
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
   patch targeting their intrinsic enhancement target.
