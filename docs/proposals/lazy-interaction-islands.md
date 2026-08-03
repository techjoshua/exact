# Broader lazy interaction-island eligibility

## Status

Proposed after
[`recursive-server-client-graph-partitioning.md`](recursive-server-client-graph-partitioning.md).
The compiler currently defers statically safe interaction-only islands and replays a bounded set of
discrete activation events. Refs, initial client work, opaque spreads, unsupported events, and
server-only child graphs keep an island eager.

| Delivery area                | Current state                                 | Proposed state                                             |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Server descendants           | Force eager activation or a broad server slot | Remain independent inert server partitions                 |
| Prop spreads                 | Opaque spreads are eager                      | Finite checker-proven spreads may remain lazy              |
| Mixed eager/lazy descendants | Enclosing island becomes eager                | Eager descendants split from a lazy interaction region     |
| Event replay                 | Existing discrete and coalesced form events   | Additional events only with explicit semantic replay rules |
| Unusual controls             | Conservative eager fallback                   | Optional prepared activation policy with bounded behavior  |

## Decision

Broaden lazy hydration by improving compiler partitioning and proof, not by declaring more events
replayable indiscriminately. Application syntax remains ordinary TSX. A server child should not
make a sibling interaction region eager when recursive partitioning proves their independence.

```tsx
<section>
	<ServerSummary />
	<button onClick={openEditor}>Edit</button>
</section>
```

The compiler may emit an inert server-rendered summary partition and a lazy interaction boundary
for the button beneath their common durable component owner.

## Goals

- Reduce eager client JavaScript without changing native component semantics.
- Permit lazy regions beside or around independently identified server slots.
- Accept statically finite spreads whose values and effects satisfy existing capture rules.
- Split eager descendants out of otherwise lazy regions at compiler-proven boundaries.
- Treat each active enhancement as an ordinary component whose setup, contexts, tasks, target
  generation, and cleanup participate in eligibility.
- Preserve native browser behavior while an island implementation loads or fails.
- Make every eager fallback explainable through language tools and build inspection.

## Non-goals

- Replaying continuous movement, scrolling, or timing-sensitive event streams.
- Delaying client setup, refs, effects, or tasks whose timing is application-observable.
- Hydrating a partial component instance with incoherent state or lifecycle ownership.
- Adding a general user-authored event serialization protocol.
- Making optional lazy activation responsible for required native control behavior.

## Eligibility analysis

Eligibility is a proof over one recursive partition node. The compiler must know:

- the exact intrinsic activation targets and supported events;
- captured state paths, props, derived values, functions, and public contexts;
- whether initial client work, refs, ownership transfer, or disposal must run eagerly;
- whether every spread key and value is statically finite and serializable;
- which descendants are independent server or eager-client partitions;
- which attributed declarations can activate ordinary enhancement components, including their
  context ordering, setup work, target resolution, and lifecycle requirements; and
- whether native fallback remains correct before activation and after load failure.

An ineligible descendant should force only the narrowest enclosing region eager. It must not make an
independent sibling eager merely because they share an authored component.

An enhancement marker is not sufficient evidence that a region is inert. If the final application
bundle activates that capability, its enhancement instance is an ordinary component in the
ownership graph. Lazy eligibility must account for its setup timing, contexts, tasks, refs, root
generation, transparent or structural output, target replacement, and disposal. Deferral may move
the enhancement and its target together only when adoption reconstructs the same ordinary ownership
and same-target context order. Required behavior must continue to use an explicit component surface
rather than depend on optional enhancement activation.

## Activation and replay

Existing generation fencing, ordered discrete replay, and latest-value coalescing remain the base
contract. Additional replay support requires an event-specific semantic rule:

- click, keyboard activation, submit, and focus-like discrete events may retain ordered replay when
  targets and default behavior remain valid;
- input and change may coalesce to the latest target value while preserving final ordering against
  submit;
- pointer movement, mouse movement, touch movement, wheel, and scroll remain eager by default;
- events are discarded when the partition generation or target identity changed; and
- load failure restores or retains native fallback behavior where possible.

A future prepared activation policy may describe an unusual control only if it is finite,
serializable, compiler-validated, and explicit about capture, coalescing, default prevention,
timeout, and failure behavior. It must not accept an arbitrary replay callback as protocol data.

## Artifact and runtime behavior

Lazy island loaders remain generated dynamic imports selected by the final application build. The
partition contract records the island implementation, server siblings, eager descendants, captures,
activation targets, and fallback behavior independently of bundler chunk names.

Hydration installs only the minimal delegated activation listener needed for eligible partitions.
Activation loads once per generation, adopts the existing DOM, restores the durable component state
authorized by matching SSR markers, installs handlers, and replays accepted events. Replacement or
unmount cancels loading and releases queued event records.

## Delivery order

1. Permit lazy partitions containing independent server slots.
2. Accept checker-proven finite spreads without relaxing serialization or effect rules.
3. Split eager descendants from otherwise lazy interaction regions.
4. Add replay policies for additional discrete events one event family at a time.
5. Consider prepared activation policy only after real controls demonstrate a need.

## Verification

- Compiler fixtures for nested server slots, finite and opaque spreads, refs, setup tasks, eager
  descendants, conditional targets, component registries, and transparent and structural
  enhancement components.
- Artifact tests proving deferred code is absent from the initial client entry and server-only code
  is absent from every client chunk.
- Hydration tests for event order, coalescing, default behavior, load failure, replacement,
  cancellation, and stale target generations.
- Browser tests for keyboard, focus, forms, and native fallback behavior.
- Bundle measurements for representative applications, reported as evidence rather than a fixed
  global size threshold.

## Acceptance criteria

1. An independent server slot no longer forces a safe sibling interaction island eager.
2. Finite safe spreads retain lazy eligibility while opaque or effectful spreads remain eager.
3. One eager descendant does not broaden unrelated lazy descendants.
4. Continuous and timing-sensitive events remain eager unless a later proposal proves semantics.
5. Failed or cancelled activation leaves the page in a correct native or previously committed state.
6. Diagnostics explain the exact reason for every conservative eager fallback.
7. Active enhancement components are analyzed and hydrated as ordinary component instances; no lazy
   boundary bypasses their setup, context ordering, task ownership, target generation, or cleanup.
