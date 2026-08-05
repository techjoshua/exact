# Cooperative structured children

## Status

**Exploratory. This proposal is not ready for acceptance, final API selection, or implementation.**

Investigate after
[`enhancements-as-component-composition.md`](enhancements-as-component-composition.md) and
[`server-component-library-trust.md`](server-component-library-trust.md), and before finalizing
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md). The
internationalization proposal supplies the first concrete use case, but this proposal must not add
an internationalization-only compiler capability merely to satisfy that design. A second credible
consumer, an ownership-safe prototype, and performance evidence are required before acceptance.

The candidate may also share internal structural facts with
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md), but neither
proposal may expose the other's build-scoped identifiers as public application API.

## Question

Should an opted-in component be able to inspect the ordered structure of the children supplied at
its invocation and cooperatively provide a scoped capability prop to participating child components?

The motivating internationalization source should remain ordinary and legible:

<!-- prettier-ignore -->
```tsx
<_ intl:message>
	Only <_ intl:usage="distance-road">{distance} {'miles'}</_> from the airport.
</_>
```

An active Unit enhancement needs to distinguish its reactive magnitude from an authored literal
source label. An active Message enhancement needs to treat that Unit as one typed placeholder,
retain the live magnitude when translated prose replaces source prose, and allow translations to
reorder the placeholder. A nested Message, Pluralize, Fragment, or other participating component
must be able to repeat the same process recursively without registration order becoming message
identity.

The desired solution should apply to other cooperative component libraries. It should not expose
raw compiler IR, make every component pay for a child graph, require authored callback wiring, or
turn eXact into a runtime VDOM/reconciliation architecture.

## Current baseline

The runtime currently represents `props.children` as `Child | Child[] | undefined`, not as an array
of inspectable component nodes. Children may include VNodes, compiled cells, strings, numbers,
reactive objects, dynamic ranges, fragments, lists, portals, components, booleans, and nullish
placeholders. The JSX runtime normally wraps created VNodes in compiled cells, and the DOM renderer
passes one normalized child directly or several children as an array.

Existing internal structure already retains useful facts:

- VNodes retain ordered children, keys, enhancement markers, and component-domain ownership;
- compiled cells and dynamic VNodes retain expression or replaceable-range boundaries;
- the renderer retains mounted child ranges, keyed identity, component ownership, and structural
  generations;
- portals preserve logical ownership despite different physical placement;
- Suspense and Activity already retain candidate or parked ranges across presentation changes; and
- the enhancement proposal requires bounded logical-output-frame traversal through transparent
  fragments, selected dynamic branches, lists, and projected children while preserving component
  opacity.

Directly casting `props.children` to `VNode[]`, unwrapping compiled cells, or mutating VNode props
would couple component libraries to private representation and could break identity, ownership,
hydration, or future compiler output. Conversely, attaching a magical `graph` property to a value
that may be a string, one VNode, or an array would be surprising and difficult to type.

## Candidate direction, not a decision

Keep ordinary `props.children` directly renderable. Offer an explicit, opt-in way to obtain a
stable, read-only structured sequence over those children. Placeholder names below describe the
shape under discussion, not an accepted API:

```ts
const content = this.inspectChildren(props.children);
```

```ts
interface ChildSequence {
	readonly source: Child | readonly Child[];
	readonly parts: readonly ChildPart[];
}

type ChildPart =
	| TextChildPart
	| LiteralChildPart
	| ReactiveChildPart
	| ComponentChildPart
	| FragmentChildPart
	| DynamicChildPart;
```

The sequence is logically ordered rather than a public graph. Component boundaries remain opaque;
portals may have different physical placement but retain one logical owner; and a dynamic branch
owns a replaceable range and generation rather than arbitrary graph edges.

The API must expose no mutable VNode, compiler operation identity, source path, source code,
dependency graph, or descendant component state. Public parts should be stable semantic handles over
existing compiler/renderer structures. Rich objects may be created lazily for inspection while the
production representation remains compact.

### Literal child provenance

The proposed Unit form relies on meaningful authored separation:

```tsx
<_ intl:usage="distance-road">
	{distance} {'miles'}
</_>
```

The intended semantic children are a reactive value and a literal source label, with authored JSX
whitespace retained as presentation. Current runtime lowering may preserve separate string entries
without preserving whether a string originated in JSX text or a literal expression. The prototype
must determine whether existing boundaries are sufficient.

If `{'miles'}` and ordinary `miles` text require different semantics, the compiler may need a
generic literal-expression marker at opted-in child boundaries. That would preserve authored child
provenance for any structured-child consumer; it must not be an internationalization parser or a
rule that recognizes unit words.

## Cooperative capability chain

The parent that owns a `ChildSequence` also owns its child slots. Rather than asking descendants to
discover an ambient collector or exposing slot IDs to them, the parent can provide a child-scoped
capability prop while constructing a participating child.

For the internationalization example, Message conceptually sees:

```text
text("Only ")
component slot U0: Unit
text(" from the airport.")
```

Message starts one message-assembly context and supplies Unit a context already bound to `U0`:

```ts
constructUnit({
	usage: 'distance-road',
	children: unitChildren,
	messageContext: rootMessageContext.forChild(U0)
});
```

Unit contributes without observing the slot:

```ts
const registration = props.messageContext?.contribute({
	kind: 'unit',
	value: distanceBinding,
	quantity: 'length',
	usage: 'road',
	sourceUnit: 'mile',
	sourceLabel: 'miles'
});
```

The inbound scoped context owns registration, replacement, cleanup, and generation fencing. The
Unit component interprets its own children and props; Message does not inspect through the Unit
boundary. The callback-only form is the minimal version of this contract. A scoped object may be
more durable because it can carry lifecycle and recursive child binding without exposing the
parent's slot identifier.

Pluralize, Select, nested Message, and other structural participants apply the same pattern. Each
receives one context bound to its position, assigns child-scoped contexts using the slots in its own
`ChildSequence`, then contributes one composite part upward. A nested Message contributes itself as
one opaque structural part before starting a new message context for its descendants.

The structural context should be an explicit parent-owned capability prop, not ambient locale
policy. `LocalizationContext` remains ordinary component context for locale, catalog, time zone,
calendar, numbering system, and unit preferences. A deeply nested component should not join a
message merely because an ambient MessageContext exists somewhere above it; cooperation crosses
only component boundaries that declare and propagate the capability.

### Controlled child configuration

The parent must not mutate child VNodes or inject arbitrary props. A participating component should
declare a finite capability it accepts, and the structured-child runtime should apply only that
capability before child setup. Conceptual names include:

```ts
children.connect(slot, MessagePartCapability, messageContext.forChild(slot));
```

or an immutable projection operation producing the same result. The design must decide whether
ordinary VNode reconstruction can implement this safely or whether core runtime support is needed
to attach a construction overlay while preserving compiled cells, keys, domains, enhancement
markers, and ownership.

This is the most important boundary for avoiding a single-use compiler feature: the compiler may
preserve generic child facts, but it should not synthesize `messageContext`, know the Unit protocol,
or execute library-provided transforms.

## Candidate responsibility split

| Layer                   | Candidate responsibility                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compiler                | Preserve generic expression, literal, component, fragment, branch, and range facts only where an opted-in contract requires them; emit static metadata without running package callbacks. |
| Core runtime/renderer   | Expose a stable child sequence, preserve slot/range ownership, apply declared child capabilities before setup, and fence cleanup across structural generations.                           |
| Enhancement components  | Interpret their own props and children, recursively wire cooperating children, and contribute typed domain parts.                                                                         |
| Ordinary context        | Carry ambient policy such as locale, time zone, readiness, errors, or services where structural child order is irrelevant.                                                                |
| Bundler/plugin host     | Extract and validate catalogs, slice locale/Unicode data, coordinate artifacts, and enforce component-library trust.                                                                      |
| DevTools/language tools | Explain child roles, accepted capabilities, source fallback, slot ownership, and diagnostics without exposing secret values or protocol identities.                                       |

Internationalization still requires static catalog extraction, placeholder validation, and portable
message metadata. A generic structured-child runtime does not by itself remove that compiler and
bundler work. The unresolved question is how much message analysis can consume generic child facts
plus finite internationalization role metadata without embedding a separate runtime composition
system in the compiler.

## Fallback model under consideration

Fallback must remain explicit and honest:

| Runtime availability                                    | Candidate behavior                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Enhancement implementation absent                       | Render authored children exactly; no component exists to interpret a literal source label. |
| Unit active outside Message                             | Unit interprets its children and formats with available locale policy.                     |
| Message active without `LocalizationContext`            | Render the compiler-authored source plan using the owning package's source locale.         |
| Localization active but catalog entry missing           | Render the complete source-locale message plan and issue configured diagnostics.           |
| Valid translation present                               | Render translated static content around the same live contributed parts.                   |
| Invalid translation or missing required structural part | Reject that entry and use the source plan.                                                 |

Consequently, an unavailable Unit enhancement leaves `1 miles` if that is what the author wrote.
The compiler should not secretly internationalize an unavailable enhancement. Authors requiring
grammatically exact enhancement-free output can use an invariant label such as `mi` or ordinary
source logic. When Unit is active, it can match the distinct literal child against its resolved
source unit and source locale, choose the intended display width, and perform source-locale unit
inflection without compiler knowledge of the word `miles`.

Message must retain live reactive bindings rather than snapshot rendered `textContent`. Translation
selection changes the projection around those bindings; it must not mount a hidden source tree only
to discover descendants, dispose source children and reconstruct their values from strings, or
duplicate component-owned ranges without explicit authority.

Scalar values may eventually support more than one projection of one read-only binding. Structural
fragments and component-owned ranges should appear exactly once unless their contract explicitly
declares reproducibility. Translation validation must enforce those multiplicity rules.

## Potential reuse

The proposal needs at least one credible consumer beyond internationalization before acceptance.
Candidates include:

### Enhancement composition and root frames

The enhancement proposal already requires ordered logical child/output frames across fragments,
selected dynamic branches, lists, projected children, and opaque component boundaries. A shared
internal child-frame abstraction could support both read-only enhancement-root discovery and
cooperative capability attachment. Co-targeted enhancement chains and direct `_` hosts may also
benefit from a common way to pass scoped capabilities through ordinary component composition.

This is reuse of structural identity and traversal, not permission for enhancement code to change
root-selection authority or inspect arbitrary descendant implementations.

### Compound component libraries

Parent/child cooperation could support ordinary libraries such as:

- Tabs assigning stable tab/panel relationships, accessibility IDs, selection, and keyboard order;
- Listbox or Menu assigning option/item identity and active-descendant coordination;
- Form assigning fields ordered validation/error contribution without refs;
- Gravity scopes assigning finite body positions and shared field coordination; and
- motion timelines assigning descendant motion parts and deterministic sequence ownership.

Application authors would write ordinary nested components. Only the component-library
implementation would inspect children and propagate the declared capability.

### Structural refresh and inspection

Compiler-planned structural refresh needs private expression, branch, list, range, containment, and
generation facts similar to those needed by a stable child sequence. Both may derive from one
internal structural model, but refresh authorization IDs remain private to build artifacts and must
not become component-facing slot identity.

DevTools could display declared cooperative relationships and cleanup generations using the same
inspectable contracts. DevTools convenience alone is not sufficient justification for the API.

### Features that should remain context-based

Error propagation, Suspense/readiness work, request/application services, and other contributions
that may originate in arbitrary opaque descendants do not need ordered parent-owned child slots.
Forcing every intervening component to forward a prop would make those features less ergonomic and
more fragile. Existing context registration remains the appropriate model for ambient or unordered
descendant coordination.

## Performance constraints

A materialized `children.graph` for every component is explicitly out of scope. A viable design
must also remain compatible with
[`javascript-performance-improvements.md`](javascript-performance-improvements.md) and:

- add no meaningful runtime cost to components that do not request structured children;
- build or expose structured parts only for opted-in boundaries and preferably lazily;
- reference existing compiled cells, bindings, VNodes, mounted ranges, and generations rather than
  duplicating the ownership tree;
- expose the same finite part/branch/range identities to compiler render, hydration, and structural
  refresh plans without creating a second runtime slot model;
- avoid promoting inert mounted ownership into a full effect scope merely because structural facts
  exist at compile time;
- cache one stable sequence per participating component invocation;
- update only the affected part or structural generation instead of rescanning on value changes;
- avoid per-update callback/context allocation and cache child-scoped capabilities;
- attach declared capabilities without cloning VNodes or compiled cells on every update;
- release branch/list slot records when their structural generation leaves the committed tree,
  including dormant Activity and abandoned Suspense candidates according to their existing
  retention contracts;
- keep rich catalog/compiler metadata out of browser runtime artifacts;
- allow final bundlers to omit runtime inspection metadata when no selected implementation consumes
  it; and
- preserve setup-once execution rather than introducing a rerender-and-reconciliation loop.

Expected complexity should be `O(k)` initial work and storage for `k` relevant parts at a
participating boundary, `O(1)` publication for an individual scalar-slot update, and work
proportional only to the changed range for branch replacement. These are design targets, not
measured results.

Required measurements include inactive and active message-heavy lists, ordinary-component
baselines, scalar updates, conditional churn, locale switching, SSR throughput, hydration time,
bundle size, allocation rate, retained heap, and whether one scalar/branch change performs work
proportional to the changed part rather than the complete child sequence.

## Resolution procedure

This document is a mandatory decision gate, not an implementation stage with a presumed positive
outcome. Work on it completes in exactly one of two ways:

1. **Accept the generic capability.** Complete the finalization gates, replace the exploratory
   probes with one decision-complete public or internal contract, update the status and downstream
   proposals, and insert any required implementation work into the repository execution sequence.
2. **Reject the generic capability.** Record why the prototypes or performance evidence did not
   justify it, remove language that implies future acceptance, select the narrowest ordinary
   component/compiler mechanism needed by internationalization, and update internationalization,
   structural refresh, lazy islands, and resumption to consume that mechanism without a parallel
   child graph.

Merely answering some open questions or leaving the proposal exploratory does not unblock the next
stage. Either outcome must settle component opacity, ownership, dynamic generations, SSR,
hydration, cleanup, and the compiler/runtime boundary sufficiently for internationalization to be
finalized.

## Open questions

This proposal must remain exploratory until the following questions have evidence-backed answers:

1. Do current JSX child entries preserve enough authored separation for `{distance} {'miles'}`, or
   is a generic literal-expression marker required?
2. Should the public abstraction be `inspectChildren`, a `ChildSequence` prop contract, a component
   method, or an internal-only facility used by framework component libraries?
3. Can capability attachment be implemented as immutable ordinary VNode composition without
   exposing or cloning compiled cells, or does the renderer need a construction-overlay primitive?
4. How do dynamic branches, keyed lists, Suspense candidates, Activity parking, portals, projected
   children, and enhancement chains retain slot identity and cleanup generation?
5. How does a parent select a translated projection before descendant setup without temporarily
   mounting hidden source DOM merely to collect contributions?
6. Which component boundaries are transparent to child inspection, and how does an ordinary
   component explicitly opt into forwarding a cooperative capability?
7. What are the placeholder duplication and omission rules for scalar bindings, formatter
   components, and structural ranges?
8. How are source and translated projections represented consistently in DOM rendering, SSR,
   hydration, refresh, and resumption without making compiler IR public?
9. Can internationalization catalog extraction consume a generic structural plan plus finite role
   metadata, or does it still require a narrower compiler-owned message plan?
10. Does enhancement composition provide a real second consumer, or only share superficial naming
    with the internationalization requirement?

## Finalization gates

Do not change this proposal to Proposed, Ready, or Accepted until all of the following are complete:

1. Build an `@exactjs/intl` prototype using current child/VNode contracts and ordinary cooperative
   props to identify the first actual framework limitation.
2. Demonstrate a second non-internationalization consumer, preferably enhancement composition or a
   representative compound component library.
3. Specify the smallest generic ownership-safe API needed by both consumers, including component
   opacity, dynamic generation, cleanup, SSR, and hydration.
4. Prove that ordinary components incur no meaningful regression and that participating boundaries
   satisfy the performance constraints above.
5. Verify source fallback, active source formatting, translated projection, locale change, nested
   Message, Pluralize/Select branches, conditional removal, stale-generation fencing, and cleanup.
6. Decide whether literal-expression provenance is a supported source contract and provide compiler
   and language-tool diagnostics if it is.
7. Resolve the catalog-extraction boundary without package compiler callbacks or public compiler IR.
8. Update the internationalization proposal with the selected model, or explicitly reject this
   candidate and document the narrower replacement.

Until those gates pass, examples in this proposal are design probes rather than promised eXact APIs.
