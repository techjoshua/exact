# Cooperative structured children

## Status

**Independent exploratory work. This proposal is not a prerequisite for internationalization or
any current implementation stage, is not ready for API selection, and has no scheduled prototype or
implementation work.**

The revised
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md) proposal
uses lexically owned message regions, finite local branch analysis, and opaque component slots. It
does not inspect runtime children or propagate cooperative capabilities through component trees.
This document now considers only component-library use cases that genuinely require ordered,
parent-owned child participation.

The candidate may share private structural facts with
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md), but neither
proposal may expose build-scoped renderer or refresh identities as public application API.

## Question

Should an explicitly opted-in component be able to inspect the ordered structure of children at its
own invocation and provide a scoped capability to participating direct child components?

Representative consumers include Tabs coordinating Tab/Panel pairs, Menu or Listbox assigning item
identity and keyboard order, Form coordinating ordered fields, and motion timelines assigning
deterministic child positions. Ambient services, error propagation, readiness, and other unordered
descendant coordination should continue to use ordinary context.

## Current baseline

The runtime represents `props.children` as `Child | Child[] | undefined`, not as inspectable
component nodes. Children may include VNodes, compiled cells, strings, numbers, reactive objects,
dynamic ranges, fragments, lists, portals, components, booleans, and nullish placeholders. The JSX
runtime normally wraps created VNodes in compiled cells, and the renderer owns mounted ranges,
component identity, keyed generations, hydration, and cleanup.

Application code must not cast `props.children` to `VNode[]`, unwrap compiled cells, mutate VNode
props, or infer ownership from DOM descendants. Those approaches couple libraries to private
representation and break under dynamic ranges, portals, hydration, or future compiler output.

Existing internal structure already retains useful facts:

- VNodes retain ordered children, keys, enhancement markers, and component-domain ownership;
- compiled cells and dynamic VNodes retain expression or replaceable-range boundaries;
- the renderer retains mounted child ranges, keyed identity, component ownership, and generations;
- portals preserve logical ownership despite different physical placement;
- Suspense and Activity retain candidate or parked ranges across presentation changes; and
- `_target` routing already follows bounded logical output frames without exposing descendant state.

These facts do not by themselves justify a public child-inspection API.

## Candidate direction

Keep ordinary `props.children` directly renderable. If evidence supports the feature, offer an
explicit opt-in capability that exposes one stable, read-only ordered sequence over the requesting
component's own children:

```ts
const content = this.inspectChildren(props.children);
```

```ts
interface ChildSequence {
	readonly source: Child | readonly Child[];
	readonly parts: readonly ChildPart[];
}
```

The sequence is logically ordered rather than a public graph. Component boundaries remain opaque;
dynamic branches own replaceable ranges and generations; portals retain logical ownership; and
rich inspection objects may be materialized lazily while production storage remains compact.

The API must expose no mutable VNode, compiler operation identity, source path, source code,
dependency graph, descendant component state, or refresh authorization ID.

## Scoped child participation

A parent that owns a child slot may need to attach one declared capability before the participating
child's setup begins. The parent must not clone or mutate the child's VNode or inject arbitrary
props. A viable design would require each participating component to declare a finite capability it
accepts, while the runtime owns attachment, replacement, cleanup, and generation fencing.

Conceptually:

```ts
children.connect(slot, TabsItemCapability, tabsContext.forChild(slot));
```

This syntax is illustrative, not accepted API. The unresolved implementation question is whether
immutable ordinary VNode composition can provide the capability safely or whether the renderer
needs a construction overlay that preserves keys, compiled cells, domains, enhancement markers,
and setup-once ownership.

## Responsibility constraints

| Layer             | Candidate responsibility                                                               |
| ----------------- | -------------------------------------------------------------------------------------- |
| Compiler          | Preserve generic child facts only for opted-in contracts; never run package callbacks. |
| Core runtime      | Expose stable ordered parts and apply declared capabilities before child setup.        |
| Component library | Interpret its own direct child roles and scoped capabilities.                          |
| Renderer          | Preserve range identity, generations, hydration, and deterministic cleanup.            |
| DevTools          | Explain declared relationships without exposing private values or protocol identities. |

No component may use this capability to inspect through an opaque descendant component, take over
another component's state, or treat authored names as renderer identity.

## Performance constraints

A materialized child graph for every component is explicitly out of scope. A viable design must:

- add no meaningful runtime cost to components that do not opt in;
- construct structured parts lazily and only for participating boundaries;
- reference existing compiled cells, VNodes, mounted ranges, and generations instead of duplicating
  the ownership tree;
- cache one stable sequence per participating invocation;
- update only the affected part or structural generation;
- avoid per-update callback or capability allocation;
- preserve bounded work for keyed replacement, branch churn, Activity, Suspense, and portals; and
- release every capability and retained range with its owning component generation.

Required measurements include large inactive and active compound-component lists, scalar updates,
branch churn, keyed reordering, SSR throughput, hydration time, bundle size, allocation rate, and
retained heap.

## Open questions

1. Do two independent component-library consumers demonstrate the same structural need?
2. Which component boundaries, if any, may explicitly forward a capability without becoming
   transparent to arbitrary inspection?
3. Can immutable composition attach a capability before child setup without cloning private cells?
4. How do conditions, keyed lists, Suspense, Activity, portals, and projected children preserve
   slot identity and cleanup generations?
5. Are direct-child roles sufficient, or would useful consumers inevitably request descendant-tree
   traversal that should remain unsupported?
6. Does the value justify its runtime, language-tool, documentation, and refactoring cost compared
   with explicit parent-owned composition or ordinary context?

## Resolution procedure

This work completes in one of two ways:

1. **Accept a generic capability.** Demonstrate at least two independent consumers, select the
   smallest ownership-safe API, record performance evidence, specify SSR/hydration/cleanup behavior,
   and insert implementation work into the repository sequence.
2. **Reject the capability.** Record why explicit composition, ordinary context, or library-local
   APIs provide adequate behavior without a new framework contract.

Until those gates pass, the examples in this document are design probes rather than promised eXact
APIs. Deferral or rejection does not block the internationalization proposal.
