# Scoped participation of direct children

## Status

**Deferred exploratory work. Immediate-child composition is implemented; this proposal covers
only coordination that composition, explicit props, and ordinary context cannot adequately express.
No participation API or implementation is selected.**

Use [child composition](../child-composition.md) to select immediate children by component type,
intrinsic tag, or text and to compose intrinsic contents. Those operations are the baseline, not
remaining work in this proposal. They do not expose component instances, component props, or durable
child-slot identities. A partition's position is not a lifecycle identity.

Internationalization does not depend on this work. Messages retain lexical ownership and opaque
component slots.

## Remaining question

Do component libraries need a framework-owned way to attach a distinct, declared capability to a
participating direct child before its component state machine is constructed, and to retain that
relationship across structural changes?

Potential consumers include Tab/Panel association, source-ordered menu participation, and motion
timelines. These are hypotheses, not accepted requirements. Existing Forms and motion layout
coordination already use context and registration; identifying roles or sharing a parent service
does not by itself justify a new framework contract.

See the [component adoption review](../child-composition-adoption.md) for concrete current consumers
and cases where existing mechanisms should remain.

[Independent enhancement target selection](independent-enhancement-target-selection.md) addresses
namespace routing, contribution targets, and local refs separately. That work does not depend on
this proposal or establish a need for a new participation capability.

## Evidence required before API design

1. Demonstrate two independent consumers with the same unmet coordination requirement. First try
   immediate-child composition, explicit author-supplied identities, scoped context, and registration.
2. State why those mechanisms fail. Distinguish authored order from registration order, mounted DOM
   order, and stable identity.
3. Specify when each participant must receive its capability, what it may do, and which owner
   releases it. Show why an ordinary context provider around the child is insufficient.
4. Describe the smallest direct-child contract that solves both consumers. Descendant traversal,
   arbitrary component prop injection, and general instance inspection are out of scope.

Do not add a second general child-inspection API or a public child graph to satisfy this proposal.

## Ownership and lifecycle decisions still required

- Define stable participation identity independently of partition array positions and opaque
  compiler/build identifiers. Preserve keyed replacement without exposing renderer protocol IDs.
- Decide whether capabilities must exist before child preparation and how failed or cancelled
  preparation releases them.
- Specify replacement, reordering, conditional and keyed children, lazy readiness, Suspense
  candidates, Activity parking, and portals. Logical participation must not depend on physical
  DOM placement or task completion order.
- Keep component boundaries opaque. Any capability forwarding needs an explicit finite contract;
  it must not make wrappers transparent to arbitrary inspection.
- Preserve component domains, enhancements, parent-owned inputs, and durable instance ownership.
  Composition does not authorize moving an already-mounted instance between unrelated owners.
- Define server rendering, hydration reconstruction, request isolation, and deterministic cleanup.
  Capabilities must not accidentally enter serialized public state.
- Determine whether declared relationships need a DevTools projection. Such a projection must
  expose no private values, refresh authorization, or public build-scoped operation identity.

The compiler may preserve opted-in structural facts. Libraries interpret their own roles; the
runtime and renderer own attachment, generations, and cleanup. Neither compiler execution of
package callbacks nor application mutation of private receipts is an acceptable shortcut.

## Cost and validation gates

A candidate must avoid a second ownership tree and materialize coordination data only for opted-in
participants. Preserve stable records across scalar updates, update affected structural generations,
and bound retained memory and work during branch churn, reordering, parking, and cancellation.

Compare the candidate with composition plus context, including a nonparticipating control. Measure
large active and inactive lists, scalar updates, keyed reordering, SSR throughput, hydration, bundle
size, allocations, and retained heap. Verify stale-generation fencing, failure cleanup, request
isolation, and cross-renderer identity alongside performance.

The existing composition helpers have a separate unresolved cost assessment: partitioning allocates
arrays, and compiler preservation of intrinsic child receipts is not restricted to consumers that
inspect children. Track that assessment in [child composition adoption](../child-composition-adoption.md);
it is neither evidence for this capability nor a completed opt-in performance guarantee.

## Resolution

If two consumers justify a common capability, write a focused ownership contract and acceptance
plan before selecting syntax or scheduling implementation. If composition, explicit identities, and
context are sufficient, close this proposal with that evidence. Until then it remains deferred and
does not block other framework work.
