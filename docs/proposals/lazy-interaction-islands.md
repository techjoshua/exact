# Broader lazy interaction-island eligibility

## Status

Ready for implementation after
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md),
[`server-component-library-trust.md`](../history/server-component-library-trust.md),
resolution or explicit rejection of the exploratory
[`cooperative-structured-children.md`](cooperative-structured-children.md) design,
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md), and
[`component-value-callback-bindings.md`](component-value-callback-bindings.md). Recursive
server/client graph partitioning is implemented in native protocol 1.27 and generated
component-contract version 2. The enhancement proposal is the next ownership prerequisite: it
allows one namespace to select several ordinary component nodes and replaces unrestricted target
search with bounded root-bearing output frames. The trust proposal then ensures that the bundler
authorizes the resolved package graph before any of those nodes enter a server-executing artifact,
without adding policy to compiler eligibility analysis. The binding proposal then defines how
generated value/change callbacks and intrinsic adapters enter the same event, ownership, and replay
analysis as their explicit source expansions. The internationalization proposal adds message-plan,
locale-catalog, formatter, and Unicode-data requirements that must travel with a deferred artifact.
This proposal defines the first broader lazy-island delivery over that resulting partition and
authorized bundle model.

Before implementation begins, experiment 1 and the dependent-foundation experiments 2–4 and 6 in
[`javascript-performance-improvements.md`](javascript-performance-improvements.md) must have
recorded dispositions. Successful render-plan, hydration-publication, progressive-bootstrap, or
transport representations must be implemented or inserted as focused prerequisite proposals;
rejected candidates leave the explicit generic fallback described here. This prevents lazy-island
artifacts from freezing a representation that the immediately preceding performance gate is meant
to select.

The first delivery includes independent server ranges, checker-proven finite spreads, localized
eager descendants, structured fallback explanations, and the event policies defined below. New
event families and an authored prepared-activation policy require a later proposal amendment.

| Delivery area                | Implemented baseline                                                            | First-delivery contract                                             |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Server descendants           | Extracted server slots force their containing element island eager              | Independent server ranges remain inert inside an interaction island |
| Prop spreads                 | Inline object-literal spreads may remain lazy; opaque spreads are eager         | Finite immutable checker-proven spreads may remain lazy             |
| Mixed eager/lazy descendants | The narrowest enclosing generated island becomes eager                          | Independently owned eager descendants split from lazy regions       |
| Event replay                 | A broad broker/compiler allowlist includes events without complete replay proof | Only the event policies in this proposal permit deferral            |
| Unusual controls             | Conservative eager fallback                                                     | Remain eager; no new authored activation API                        |
| Explanations                 | Partition reasons exist, but island fallback is not fully structured            | Every eager fallback has a stable reason code and source range      |

## Decision

Broaden lazy hydration by applying a deterministic eligibility proof to the implemented partition
plan. Application syntax remains ordinary TSX. A server descendant does not make a sibling or
containing interaction region eager when its partition has independent placement, range identity,
refresh authority, generation, and fallback containment.

```tsx
<section>
	<ServerSummary />
	<button onClick={openEditor}>Edit</button>
</section>
```

The compiler emits an inert server range for `ServerSummary` and an interaction-activated client
range for the button beneath their common durable component owner. DOM containment does not merge
their activation or refresh authority.

Lazy eligibility is a property of a partition region, not an instruction to partially execute a
component. One component setup still executes at most once for each live component instance. The
compiler may extract a generated island implementation only when doing so does not duplicate
observable setup, state, contexts, tasks, refs, resources, or cleanup. Otherwise it marks the
narrowest region requiring that component instance eager.

## First-delivery scope

The implementation order is normative:

1. Permit interaction regions containing independent inert server ranges.
2. Accept finite checker-proven spreads without relaxing effect, capture, or serialization rules.
3. Split independently owned eager descendants from otherwise lazy interaction regions.
4. Emit structured activation decisions and expose them through language tools, build inspection,
   and DevTools.
5. Narrow compiler and hydration event eligibility to the replay policies in this proposal.

Prepared activation policies and additional event families are not acceptance requirements for
this delivery.

## Goals

- Reduce eager client JavaScript without changing native component semantics.
- Permit lazy regions beside or around independently identified server ranges.
- Accept statically finite spreads whose evaluation and values satisfy existing safety rules.
- Localize eager descendants without incoherent component or enhancement ownership.
- Preserve native control state and default behavior during loading and failure.
- Make every conservative eager fallback stable, source-located, and inspectable.
- Keep active enhancements as ordinary components in the ownership and activation graph.

## Non-goals

- Replaying continuous movement, scrolling, dragging, composition, or timing-sensitive streams.
- Delaying client setup, refs, effects, tasks, or resources whose timing is observable.
- Hydrating part of a component instance or executing its setup more than once.
- Adding general event serialization or a user-authored replay callback.
- Making optional lazy activation responsible for required native control behavior.
- Changing component-contract version 2, public component syntax, or public transport identity.
- Treating a server refresh as activation of a dormant client region.

## Eligibility model

The native compiler computes activation after placement, artifact reachability, activator-selected
enhancement component groups, bounded root-frame target ownership, branch/key identity, refresh
authority, and fallback containment are known.
It visits partition nodes in stable source order and assigns one of the existing activation modes:

- `server-only` executes only on the server;
- `inert` retains server-rendered markup and range authority without a live browser component;
- `interaction` defers a complete generated client implementation until an approved event; and
- `eager` activates during ordinary root hydration.

For each client-capable region, the compiler applies these rules in order:

1. A region with no browser work is `inert` unless its placement requires server execution, in
   which case it is `server-only`.
2. Initial client work, refs, mount or disposal effects, owned resources, eager tasks, required
   contexts that cannot be restored, unsupported captures, or unsupported events make the
   narrowest containing region `eager`.
3. A region whose only browser work is approved event handling or a compiler-supported form
   binding is an `interaction` candidate.
4. Independent `server-only` or `inert` descendants do not change that candidate. They retain
   their own plan edge, DOM range, refresh authority, fallback, discriminator, and generation.
5. An eager descendant remains separate only when it has an independent component or enhancement
   contract and its complete ownership chain can activate without executing a dormant ancestor's
   setup. Otherwise the nearest owner required by both regions becomes eager.
6. An ineligible sibling never broadens an independently owned interaction sibling.
7. An unresolved render edge, effect, spread, capture, target, or ownership relationship broadens
   only the nearest fallback range that contains the uncertainty.

The planner must not infer separability from DOM shape alone. A nested marker can activate before a
DOM ancestor, but only when the partition contract identifies a live or resumable logical component
owner. If constructing that owner requires dormant setup, the compiler uses eager fallback.

Conditional branches, keyed items, registry selections, Suspense, and Activity retain their
existing partition templates. Each runtime selection has its own activation mode, discriminator,
and generation. Switching a selection releases queued activation and owned components from the old
generation before the new selection becomes eligible.

## Finite spread proof

A spread may retain lazy eligibility when the checker and effect analysis can enumerate its final
property keys and prove evaluation safe. The proof accepts:

- an inline object literal;
- parentheses, `as const`, and `satisfies` around an otherwise eligible expression;
- a module- or component-local `const` with one declaration, no writes, no escaping mutable alias,
  and an eligible initializer; and
- nested spreads of eligible values, preserving JavaScript source-order overwrite semantics.

Every accepted object must have static string property names. Its properties may contain
serializable fallback values, compiler-bridged state or value captures, and compiler-analyzed event
handlers. Event-valued spread properties participate in the same event-policy proof as explicit JSX
attributes. Reading the object and each property initializer must be effect-free under the existing
callable-effect analysis.

The proof rejects:

- parameters, mutable bindings, calls, constructors, getters, setters, methods, proxies, and
  escaping aliases;
- computed or symbol keys, index signatures, and values typed as `any` or `unknown`;
- unions for which every member does not have the same finite property-key set;
- properties whose evaluation has an unknown, browser-only initial, or server-only effect;
- server-only values entering a client artifact; and
- functions or values that fail the existing island capture and serialization contracts.

Rejected spreads make only the containing candidate eager and record `opaque-spread` or the more
specific failing reason. They do not produce authored runtime guards.

## Enhancement components

The compiler resolves every authored namespace into activator-selected canonical component groups
and computes eligibility without consulting component-library trust. Each potentially available
selected component is an ordinary `enhancement-component` partition node, not element metadata.
Shared enhancement props contribute to every selected component group that declares them. Each
node's setup, complete grouped props, contexts, tasks, refs, output, root-bearing frame or direct
`_` composition boundary, generation, and cleanup contribute to the same proof as an authored
component.

The final bundler independently applies the shared server component-library trust policy to its
resolved artifact graph before module evaluation. It preserves the compiler's activation facts for
authorized nodes, omits optional unauthorized enhancement nodes when policy permits, and fails when
required unauthorized component code would enter a server artifact. It does not ask the compiler to
recompute eligibility or trust. Paired hydration catalogs use the bundler's one authorization result
so removing an optional server enhancement cannot leave an ownership-incompatible client activation.

An enhancement and its intrinsic target, or a direct `_` enhancement chain and its fragment
boundary, may defer together only when:

- the enhancement has no required initial client work, ref, resource, or eager task;
- every same-target enhancement can defer while preserving compiler-established context order;
- every activator-selected component and shared-prop recipient has compatible activation timing;
- transparent or structural output stays within the same fallback and target or fragment-boundary
  generation;
- target adoption reconstructs the same logical component ownership, first-root path, root-bearing
  frame, and selected intrinsic, or reconstructs the same direct `_` boundary without performing a
  root search; and
- load failure leaves correct intrinsic or transparent-fragment behavior without the enhancement.

If one same-target enhancement must be eager, the compiler makes the smallest range containing that
enhancement and target eager. It does not flatten enhancement ownership or silently defer required
behavior. An unavailable optional capability creates no enhancement component and therefore adds
no activation requirement.

An active internationalization enhancement may defer only when its code, locale-specific catalog
fragment, formatter implementation, and required Unicode/unit data share one activation generation.
Interaction replay cannot publish translated output before those inputs are ready. Load failure
retains the authored source fragment and must not expose a message key, partially converted unit, or
mixed-locale branch.

A structural change that replaces the first-root path, root-bearing frame, selected intrinsic, or
direct `_` boundary invalidates queued activation under the old target or fragment-boundary
generation. Changes inside component frames that the bounded routing contract treats as opaque
cannot broaden or invalidate an ancestor island.

## Generated contracts

The implemented partition node already carries `activation`, component ownership, placement,
artifact targets, refresh authority, source range, child edges, and conservative fallback. The
first delivery extends native analysis with structured activation details equivalent to:

```ts
type ExactActivationDecision = Readonly<{
	mode: 'server-only' | 'eager' | 'interaction' | 'inert';
	reasons: readonly ExactActivationReason[];
	targets: readonly ExactActivationTarget[];
}>;

type ExactActivationReason = Readonly<{
	code:
		| 'initial-client-work'
		| 'ref'
		| 'owned-resource'
		| 'eager-task'
		| 'required-context'
		| 'unsafe-capture'
		| 'opaque-spread'
		| 'unsupported-event'
		| 'unsupported-event-data'
		| 'unsplittable-owner'
		| 'enhancement-setup'
		| 'enhancement-target'
		| 'unresolved-effect';
	start: number;
	length: number;
	detail?: string;
}>;

type ExactActivationTarget = Readonly<{
	id: string;
	events: readonly ExactLazyEventPolicy[];
}>;

type ExactLazyEventPolicy = Readonly<{
	type: 'click' | 'submit' | 'input' | 'change' | 'focus' | 'blur' | 'focusin' | 'focusout';
	replay: 'native-click' | 'request-submit' | 'latest-value' | 'notification';
}>;
```

These fields are compiler analysis and generated hydration-registration data, not application
syntax or durable transport identity. Their addition advances the native compiler protocol to
1.28. Generated component-contract version 2 remains sufficient because component implementations,
boundaries, resumptions, and ordinary ownership do not change shape.

Generated lazy registry entries carry the activation targets and policies beside their dynamic
loader. SSR continues to emit the existing client-boundary, server-range, target identity, and
generation markers. Event names are not copied into public HTML. Hydration installs the union of
listeners required by dormant registry entries and verifies a boundary's own target policy before
activation.

Bundler chunk names and module paths remain private to generated imports. Server-only code must be
absent from every client entry and lazy chunk.

## Implementation ownership

- The native TypeScript-Go overlay is the single source of truth for eligibility, spread proof,
  activation targets, reason codes, and partition activation. The JavaScript compiler facade
  validates and projects native protocol 1.28; it does not reclassify source.
- `@exactjs/compiler` emits target-specific artifacts, lazy registry metadata, build inspection,
  and language-tool projections from that analysis.
- `@exactjs/ssr` renders the already planned client and server ranges and existing markers. It does
  not decide whether a region is lazy.
- `@exactjs/hydrate` owns the generation-scoped state machine, delegated listeners, adoption,
  replay, failure fallback, and release. It rejects events not authorized by generated registry
  metadata even if a listener is installed for another boundary.
- The DOM renderer retains component and enhancement lifecycle ownership. It exposes the adoption
  and release operations needed by hydration but contains no second eligibility algorithm.
- DevTools and language tools consume structured decisions read-only and never turn inspection
  identity into activation or refresh authority.

## Event policy

Deferral is permitted only when the runtime can preserve the relevant native transition:

| Event family                           | First-delivery behavior                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `click`                                | Cancel once, load, resolve the fenced target, and call its native `click()` once        |
| `submit`                               | Cancel once, retain submitter identity, then call `requestSubmit()` once                |
| `input`, `change`                      | Preserve the browser's control mutation and coalesce to the latest value per target     |
| `focus`, `blur`, `focusin`, `focusout` | Preserve the completed native focus transition and replay only the handler notification |
| Keyboard activation of native controls | Activates through the resulting `click`; authored key handlers themselves remain eager  |
| All other event families               | Eager                                                                                   |

Component value/callback shorthand contributes the same callback state write, captures, and
invocation event as its explicit value-plus-callback expansion; it does not make the callback lazy
by declaration. Canonical intrinsic `value:onInput`, `value:onChange`, and `checked:onChange`
bindings use the existing `input`/`change` policies. The new `details` `open:onToggle` binding
remains eager in this first delivery because `toggle` is not an approved replay family.

Event-family eligibility also proves how the handler uses its event parameter. An ignored event
parameter is safe. The first delivery otherwise permits only:

- `type`, `target`, and `currentTarget` for every approved family;
- target control `value`, `checked`, and selected-option state for `input` and `change`; and
- `submitter` identity for `submit`.

Reading coordinates, buttons, modifiers, `detail`, `relatedTarget`, `isTrusted`, composition or
input payload fields, retaining the event object, passing it to an unresolved call, or observing it
after an async boundary makes the region eager with `unsupported-event-data`. This restriction is
what permits `click()` and `requestSubmit()` to preserve default action without pretending a later
synthetic event is the original trusted browser event.

`beforeinput`, composition events, pointer and mouse button streams, touch events, wheel, scroll,
drag/drop, movement, animation, transition, clipboard, and media events remain eager in this
delivery. Synthetic dispatch cannot generally reproduce their trusted default action, timing,
`DataTransfer`, selection, gesture, or continuous-stream semantics.

The current broader compiler and broker lists are implementation history, not proof of safe replay.
This delivery narrows both lists to the table above and updates current documentation accordingly.
Adding an event later requires an event-specific amendment defining capture data, default action,
coalescing, ordering, target resolution, failure, and browser tests.

## Runtime state machine

Each interaction boundary generation has exactly one state:

```text
dormant -> loading -> active
             |          |
             v          v
           failed     released
             |
             v
           released
```

- The first approved event snapshots the boundary generation, target identity, event policy,
  control value where applicable, and submitter identity where applicable.
- One loader promise is shared by all events for that boundary generation.
- Ordered policies retain source order. `input` and `change` keep only the latest record per target
  while preserving their final order relative to `submit`.
- A boundary holds at most 256 queued records. Once full, it discards the oldest non-submit record;
  if no such record exists, it rejects the newest record and emits a redacted hydration framework
  event containing only the boundary identity, generation, event type, and queue size.
- Successful loading adopts the existing DOM, restores only compiler-authorized state and public
  contexts, installs handlers, and replays accepted records according to policy.
- A server-range refresh inside a dormant boundary updates only that range. It does not load the
  client implementation. Target resolution after the refresh uses the current range generation.
- Replacement, branch or key change, target-generation change, root abort, or unmount releases the
  pending generation. Loader completion and queued records from a released generation are ignored.
- Import failure marks that boundary generation `failed`. Native click or submit fallback is
  performed exactly once if it was previously cancelled; control and focus transitions already
  performed by the browser are not repeated. No handler is fabricated, and the failed generation
  does not retry until replacement creates a new generation.
- Activation never moves refresh authority and never authorizes an operation outside the existing
  partition contract.

Parent DOM containment does not serialize unrelated loaders. Activation waits only for logical
component owners required by the partition graph. Independent sibling regions may load in parallel.

## Startup, hydration, and dormant-generation constraints

Lazy activation should reduce both loaded code and live runtime state. It must remain compatible
with [`javascript-performance-improvements.md`](javascript-performance-improvements.md):

- a dormant boundary retains one compact identity/generation record and the minimum range and
  loader facts needed for activation, not a component instance, effect scope, task owner, copied
  VNode subtree, or eager enhancement-planning graph;
- the event queue's 256-record limit is also a memory bound: records capture only the fields named
  by their event policy, coalescing releases superseded values immediately, and no record retains a
  native `Event`, DOM ancestor chain, component instance, or arbitrary payload;
- one loader promise and one failure record are shared per generation, and released, replaced, and
  failed generations delete queued records and loader closures promptly;
- activating a boundary adopts or creates ordinary lazily materialized component ownership rather
  than preserving a second dormant shell beside the active tree; and
- DevTools reports counts and redacted identities without retaining event records or completed
  generations after its sink detaches.

The compiler emits the minimum runtime capability set for each lazy artifact and page root. A
dormant boundary must not load renderer features it cannot reach. SSR should reference one
document-level, versioned hydration table rather than embed and independently validate a complete
JSON props graph on every boundary. Activation decodes its indexed record lazily and follows a
compiler-guided adoption cursor for proven static structure, while malformed records recover at
their own boundary.

Preload policy should distinguish immediately visible, likely interaction, and cold boundaries;
independent likely boundaries may load concurrently under a host limit. Explanations must attribute
initial and lazy bytes to source capabilities so a developer can see why a root retained a task,
enhancement, refresh, compatibility, or other runtime feature.

Verification must include retained-heap plateaus for repeated dormant-create/release cycles,
bounded event floods, failed imports, refresh-before-activation, and activation/unmount churn. It
must also report initial/lazy compressed bytes, module parse/evaluation, hydration-table parse,
activation-to-handler latency, adoption work, and fallback mount work.

## Explanations and inspection

Expected eager fallback is not a compiler warning. The activation decision and reason codes appear
in source inspection, editor hover, artifact inspection, and DevTools. Build inspection reports the
narrowest source range, reason code, affected partition, and resulting activation mode.

Existing hard diagnostics remain hard errors for illegal placement or data flow, including a client
island capturing a server-only import. Conservative classification remains successful compilation.
DevTools shows dormant, loading, active, failed, and released generations; queued event counts are
reported without event payloads or captured values.

## Verification

- Native compiler fixtures cover independent and nested server ranges, source-order siblings,
  finite and rejected spreads, eager descendants, unresolved ownership, conditionals, keyed items,
  registries, Suspense, Activity, selector-only and payload-bearing activators, shared-prop
  recipients, and transparent and structural enhancement components.
- Artifact tests prove deferred implementations are absent from initial client entries and
  server-only code is absent from all client chunks.
- SSR tests preserve independent range, target, discriminator, fallback, and generation markers
  inside dormant boundaries.
- Hydration tests cover every approved event policy, ordering, coalescing, the 256-record bound,
  first-root-path and root-bearing-frame replacement, target replacement, import failure, root
  abort, unmount, and stale generations.
- Refresh tests exercise server updates before loading, during loading, after activation, and after
  branch, key, registry, or enhancement-target replacement.
- Ownership tests prove setup-once behavior, context ordering, task/resource cleanup, and ordinary
  enhancement component inspection across activation and cancellation.
- Browser tests cover native button keyboard activation, form validation and submitters, input and
  selection preservation, focus transitions, failed imports, and native fallback behavior.
- Language-tool and DevTools tests verify stable reason codes and redaction of queued payloads.
- Representative applications report initial entry and lazy-chunk changes as evidence rather than
  enforcing one global byte threshold.

## Acceptance criteria

1. An independent server range no longer forces a safe containing or sibling interaction region
   eager and can refresh without activating that region.
2. Eligible finite spreads retain lazy activation while mutable, effectful, or open-ended spreads
   produce a localized `opaque-spread` or more specific eager reason.
3. An independently owned eager descendant does not broaden an unrelated interaction region, and
   no split duplicates component or enhancement setup.
4. Only the event families and replay policies in this proposal permit interaction deferral.
5. Failed, cancelled, replaced, or stale activation leaves correct native or previously committed
   state and never replays into a different generation.
6. Every conservative eager fallback exposes a stable reason code and narrow source range.
7. Active enhancement components remain ordinary component instances with preserved setup, context
   ordering, task ownership, activator grouping, shared props, root-bearing frame, target generation,
   inspection, and cleanup.
8. The protocol version allocated after the enhancement prerequisite rejects incompatible analysis
   clients; component-contract version 2 remains valid only if the prerequisite requires no schema
   change.
9. This proposal adds no authoring syntax or transport identity beyond the preceding enhancement
   and component value/callback binding contracts.
