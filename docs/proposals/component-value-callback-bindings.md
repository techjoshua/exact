# Component value/callback binding shorthand

## Status

**Ready for implementation.** Implement after
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md) and
[`server-component-library-trust.md`](../history/server-component-library-trust.md), and before
[`lazy-interaction-islands.md`](lazy-interaction-islands.md),
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md), and
[`partial-prerender-resumption.md`](partial-prerender-resumption.md). It is independent of the
deferred [`cooperative-structured-children.md`](cooperative-structured-children.md) decision and
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md), so it is
the next actionable proposal while those designs remain unresolved. Lazy eligibility and event
replay must analyze the generated callback exactly as they analyze its explicit source equivalent.

The syntax, duplicate-prop behavior, ordinary callback semantics, intrinsic endpoint table,
enhancement ambiguity policy, compiler ownership, delivery order, and acceptance gates are
decision-complete. Implementation may refine private compiler organization but must not add
callback composition, binding-specific lifetime behavior, writable props, or a runtime binding
abstraction.

This proposal depends on the enhancement proposal's final namespaced-JSX and kebab-case resolution
rules. A namespaced attribute that could denote either an enhancement member or a component binding
must fail with an ambiguity diagnostic; neither feature receives silent precedence.

| Area                        | Current form                                        | Proposed form                                                            |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| Component controlled value  | Explicit value prop plus mechanical change callback | `valueProp:callbackProp={statePath}`                                     |
| Text-like intrinsic binding | `value:input`                                       | `value:onInput`                                                          |
| Committed intrinsic binding | `value:change`                                      | `value:onChange`                                                         |
| Checkbox/radio binding      | `checked:change`                                    | `checked:onChange`                                                       |
| Details disclosure binding  | Explicit `open` plus `onToggle` state update        | `open:onToggle`                                                          |
| Authored notification       | Intrinsic binding runs before same-event handler    | Intrinsics retain that behavior; duplicate component callback props fail |
| Runtime abstraction         | DOM-specific compiler binding markers               | No new component runtime abstraction                                     |
| State ownership             | Parent owns the writable state path                 | Unchanged                                                                |

## Decision

Allow a component invocation to pair one value prop with one callback prop directly in JSX:

```tsx
<Dialog open:onOpenChanged={this.state.dialogOpen} />
```

Both names are ordinary props from `Dialog`'s finite public prop type:

```tsx
type DialogProps = {
	open: boolean;
	onOpenChanged?(open: boolean): void;
};

function Dialog(props: DialogProps) {
	return () =>
		props.open ? (
			<dialog open>
				<button onClick={() => props.onOpenChanged?.(false)}>Close</button>
			</dialog>
		) : null;
}
```

The compiler lowers the binding to the same semantics as the explicit controlled-component form:

```tsx
<Dialog
	open={this.state.dialogOpen}
	onOpenChanged={(open) => {
		this.state.dialogOpen = open;
	}}
/>
```

This is source shorthand only. It does not create shared state, writable props, a channel, a
binding object, a setter prop visible to the child, or a second state owner. The parent continues to
own `this.state.dialogOpen`; the child receives an ordinary reactive `open` value and invokes an
ordinary callback when it wants to publish a replacement.

The lowering must also preserve the performance constraints in
[`javascript-performance-improvements.md`](javascript-performance-improvements.md). A binding adds no
runtime registry, subscription, channel, or per-render composition object beyond what its explicit
value-plus-callback expansion requires. It receives exactly the callback allocation, identity,
ownership, cleanup, and optimization behavior of the equivalent authored lambda—no stronger and no
weaker. The value read and generated assignment should participate in the same compiler-known
dependency slot as an equivalent explicit controlled prop; binding shorthand must not force the
generic proxy-tracking path or make an otherwise lazy interaction island eager.

The explicit spelling remains fully supported and is required whenever notification has semantics
beyond unconditional assignment, including validation, refusal, transformation, asynchronous
acceptance, or a meaningful callback result.

## Component binding syntax

For an eXact component tag, interpret:

```tsx
<Component valueProp:callbackProp={target} />
```

as a request to synthesize both:

```tsx
valueProp={target}
callbackProp={(nextValue, ..._remainingArguments) => {
	target = nextValue;
}}
```

The callback's first ordinary parameter is always the replacement value. Additional callback
parameters are permitted and ignored by the synthesized assignment.

Examples include:

```tsx
<Toggle checked:onCheckedChanged={this.state.enabled} />
<Select selectedValue:onSelectionChanged={this.state.selectedId} />
<Paginator page:onPageChanged={this.state.page} />
```

The right side of the colon is explicit. The compiler does not infer `onOpenChange`,
`onOpenChanged`, or another convention from `open`, and the component does not publish separate
bindability metadata. Independently compiled packages participate through their ordinary finite
TypeScript prop declarations and generated component contracts.

### Type and target validation

The compiler accepts a component binding only when all of the following hold:

1. The left name resolves to exactly one ordinary component prop.
2. The right name resolves to exactly one ordinary callable component prop after removing only
   optional `undefined` from its type.
3. The callback has one unambiguous supported call signature and at least one required ordinary
   parameter.
4. The target is one compiler-proven writable reactive state location accepted by the existing
   state-write contract.
5. Reading the target is assignable to the value prop.
6. The callback's first parameter is assignable to the target location.
7. The callback's result is notification-only. A required non-`void` result, promise result,
   acceptance result, or functional-updater protocol requires explicit source.
8. The ordinary explicit expansion is legal under the same placement, serialization, interaction,
   task, secret-flow, ownership, and continuation rules.

The two directions are checked independently rather than requiring textual type equality. This
retains normal TypeScript optionality and narrowing while rejecting a callback value that cannot be
written safely to the target.

The initial delivery rejects ambiguous overloads, a value parameter hidden behind an unsupported
rest-only signature, reflective or computed callback discovery, an open prop dictionary, and a
target that would require an inverse transformation:

```tsx
// Not writable.
<Dialog open:onOpenChanged={!this.state.dialogClosed} />

// Not one state location.
<Paginator page:onPageChanged={choosePage()} />
```

Aliases to state paths are accepted only when the existing compiler analysis proves the same
writable location and generation. Dynamic computed paths retain their current client/server and
continuation restrictions.

### Duplicate props and explicit behavior

The shorthand supplies both named props. Supplying either prop explicitly in the same JSX opening
element is an ordinary duplicate-prop compiler error:

```tsx
// Diagnostic: `open` is supplied twice.
<Dialog open:onOpenChanged={this.state.dialogOpen} open={true} />
```

```tsx
// Diagnostic: `onOpenChanged` is supplied twice.
<Dialog
	open:onOpenChanged={this.state.dialogOpen}
	onOpenChanged={(open) => this.log.info('dialog changed', { open })}
/>
```

There is no automatic callback composition, ordering rule, or argument forwarding. Authors who
need logging, validation, veto, transformation, asynchronous acceptance, or any other callback
behavior write the complete explicit value-plus-callback form. One callback prop likewise cannot
serve two binding shorthands at the same boundary. A finite spread statically proven to supply
either generated prop receives the existing duplicate-prop diagnostic; opaque spreads retain the
framework's ordinary JSX spread analysis and gain no binding-specific composition path.

### Ordinary callback ownership

The generated arrow is the ordinary lambda shown by the source expansion. Its parent closure,
interaction/task attachment, keyed or branch ownership, allocation, identity, cleanup, and stale
generation behavior are exactly those of that explicit lambda. The shorthand adds no callback
resource, wrapper, lifetime fence, setup registration, or operation identity of its own.

No new cross-host callback transport is introduced. If the explicit value-plus-callback expansion
cannot cross a client/server boundary under current component continuation rules, the shorthand
receives the same diagnostic. Any opaque operation identity produced by ordinary callback lowering
remains governed by that existing lowering rather than by the binding syntax.

## Intrinsic binding alignment

Replace the canonical abbreviated intrinsic spellings with endpoint-naming spellings:

```tsx
<input value:onInput={this.state.name} />
<input type="number" value:onChange={this.state.quantity} />
<input type="date" value:onChange={this.state.date} />
<input type="checkbox" checked:onChange={this.state.subscribed} />
<input type="radio" value="ground" checked:onChange={this.state.delivery} />
<input type="checkbox" value="ups" checked:onChange={this.state.carriers} />
<select multiple value:onChange={this.state.tags}>...</select>
<details open:onToggle={this.state.advanced}>...</details>
```

The common reading is:

```text
left name   = value/property supplied from state
right name  = callback or event endpoint publishing changes
expression  = writable state location receiving the replacement
```

Intrinsic endpoints remain a finite compiler-owned table rather than the generic component rule.
DOM handlers receive events, not replacement values, so each supported pair retains a specialized
adapter that reads the correct property after the browser update.

### First-delivery intrinsic matrix

| Syntax             | Elements and controls                                 | Published state                                           |
| ------------------ | ----------------------------------------------------- | --------------------------------------------------------- |
| `value:onInput`    | Mutable value-editing `input` and `textarea` controls | Intermediate string, number, `Date`, or nullable value    |
| `value:onChange`   | Mutable value `input`, `textarea`, and `select`       | Committed scalar or homogeneous multi-select array        |
| `checked:onChange` | Checkbox and radio `input`                            | Boolean, radio value, or homogeneous checkbox-value array |
| `open:onToggle`    | `details`                                             | Boolean disclosure state                                  |

`value:onInput` exists where intermediate edits differ meaningfully from committed changes, such
as typing and range dragging. `select` publishes `input` and `change` for the same selection update,
and checkbox/radio controls publish both for the same discrete toggle, so their canonical bindings
use only `onChange` rather than expose redundant alternatives.

The existing intrinsic validation remains in force: boolean checked state requires a checkbox;
radio and checkbox collection bindings require appropriate explicit values; `Date`, number,
nullable, and select-multiple conversions must match the control; and button, hidden, file, and
other non-editable input states cannot claim an unsupported two-way value.

`details` is the only new non-form intrinsic in the first delivery. Setting its `open` property is
the state-to-DOM direction; after a `toggle`, the adapter reads the resulting `open` value before an
authored `onToggle` handler. Named exclusive details groups can close another member, and each
affected bound member publishes its own final `open` value from its own `toggle` event. Coalesced
events publish the property value observed when the event is delivered. State writes that agree
with the live property produce no DOM write, preventing a browser-selected exclusive-group result
from feeding back into another toggle. During hydration, a pre-hydration disclosure change is
adopted and published through the compiled binding before normal reactive property publication,
matching dirty form-control adoption.

### Intrinsic event composition and platform behavior

An authored handler for the selected endpoint remains allowed and runs after the binding publishes:

```tsx
<input
	value:onInput={this.state.name}
	onInput={(event) => {
		this.log.info('edited', { value: event.currentTarget.value });
	}}
/>

<details
	open:onToggle={this.state.advanced}
	onToggle={(event) => {
		this.log.info('details toggled', { state: event.newState });
	}}
/>
```

Intrinsic binding listeners retain their current renderer ordering ahead of delegated authored
handlers. Control-specific dirty-value preservation, number/date conversion, radio and checkbox
membership, multi-select extraction, SSR output, hydration adoption, keyed movement, Activity
retention, and unmount cleanup remain specialized DOM responsibilities.

This event composition is intrinsic-only. A DOM handler receives an event and is not a viable
replacement-value callback prop, so it does not create a component shorthand collision. `_target`
always contributes to an intrinsic and already composes event handlers as independently owned
subscriptions; it never intercepts or merges a child component's callback props. Generic component
value/callback shorthand therefore does not apply to `_target`.

The canonical intrinsic spellings preserve the existing control contract rather than expanding
platform observation. Form reset, browser restoration, and autofill publish only when the platform
dispatches the selected finite endpoint. The compiler and renderer do not synthesize events or add
document-wide observers. Pre-hydration dirty controls continue through the existing adoption path,
which restores the live value and publishes it through the compiled binding before normal reactive
updates. A platform mutation that dispatches no selected endpoint remains browser-owned until a
later endpoint event or application state write; this limitation must be documented rather than
hidden behind polling or mutation observation.

### Deliberate intrinsic exclusions

Do not generalize the first delivery merely because a DOM property and event share plausible names:

- File input `files` is not writable from application state and therefore is not two-way.
- Dialog openness requires `show()`, `showModal()`, `requestClose()`, or `close()` semantics; direct
  `open` reflection can corrupt modal and top-layer behavior.
- Popover openness is method- and top-layer-owned rather than an ordinary writable `open` property.
- `contentEditable` requires composition, selection, mutation, text/HTML, and safety policy.
- Scroll offsets and selection ranges are coordinated high-frequency state, not ordinary values.
- Media time, volume, mute, and rate pairs require readiness, seeking, frequency, and shared-event
  policy and may be considered in a separate intrinsic-media extension.
- Media `paused` is not writable; play and pause are imperative operations with asynchronous failure.

Ordinary explicit props, handlers, refs, tasks, contexts, and component libraries remain available
for these cases.

### Intrinsic spelling replacement

Replace `value:input`, `value:change`, and `checked:change` directly with `value:onInput`,
`value:onChange`, and `checked:onChange`. The framework is unpublished, so the implementation must
update all repository source, fixtures, generated examples, engineering documentation, public docs,
and reusable guidance atomically rather than carry compatibility aliases.

The compiler recognizes only the new endpoint names. The previous spellings receive the same
ordinary unknown or invalid namespaced-attribute analysis as any other unsupported source. Existing
general typo heuristics may suggest a valid prop or event name when they naturally match, but this
proposal adds no legacy-name table, spelling-specific diagnostic, migration action, alternate parser
path, lowering alias, or other code intended to recognize or mitigate the previous forms.

## Enhancement-name resolution and collisions

The enhancement proposal uses attributed namespace bindings and canonical kebab-case authored
members:

```tsx
<Card motion:slide-up />
```

Component callback props conventionally use camelCase `on*` names:

```tsx
<Dialog open:onOpenChanged={this.state.dialogOpen} />
```

Those spellings normally distinguish the features, but spelling is not security or correctness.
The compiler resolves each namespaced attribute against all applicable interpretations:

1. On a supported standard intrinsic, check the finite intrinsic binding table.
2. On an eXact component, check whether the left and right names form a valid finite prop/callback
   pair.
3. At any enhancement-capable boundary, check whether the left name resolves to a local attributed
   enhancement namespace and the right name is a valid canonical enhancement member.
4. Accept the attribute only when exactly one interpretation remains.

If both component binding and enhancement composition remain viable, emit a hard diagnostic that
names both candidates, their resolved prop/component identities, and their source declarations. Do
not prefer a component prop because it starts with `on`, prefer an enhancement because its namespace
is imported, or choose based on source order.

An explicitly authored value or callback prop is not a competing interpretation: once the
namespaced attribute resolves as a component binding, either explicit prop is simply a duplicate.
Likewise, `_target` has only intrinsic contribution semantics and is never a generic component
binding candidate.

The diagnostic offers explicit repairs:

- expand the binding into separate value and callback props; or
- rename the local attributed enhancement import namespace and keep the enhancement member.

For example, an ambiguous binding can always be written without namespaced syntax:

```tsx
<Widget
	mode={this.state.mode}
	onModeChanged={(mode) => {
		this.state.mode = mode;
	}}
/>
```

Kebab-case enhancement completion and camelCase callback completion should prevent most collisions
before authoring. Language tools must nevertheless retain both candidate sets until semantic
resolution and explain ambiguity rather than suppress one completion family.

Custom elements do not acquire generic component binding semantics merely because they contain a
colon attribute. They require a separately typed, finite adapter because `CustomEvent` payloads and
property reflection are not standardized as replacement-value callbacks.

## Compiler and language-tool ownership

This feature belongs to JSX semantic analysis, type checking, state-path validation, callback
lowering, placement/continuation analysis, language tools, and intrinsic DOM adapter lowering.
Component runtimes receive an ordinary value and ordinary callback; no channel, writable-prop
proxy, shared state cell, component binding registry, or callback convention is added.

The native compiler must represent the shorthand as one source binding edge with:

- parent state owner and writable path;
- authored JSX boundary;
- value prop and callback prop identities;
- callback first-parameter type and additional argument contract;
- placement and artifact targets; and
- intrinsic adapter identity where applicable.

Generated code may reuse existing prop callback and DOM binding machinery, but inspection and
diagnostics should preserve the authored paired syntax rather than expose helper names. After
validation, ordinary component callback analysis must consume the same lambda representation it
would receive from the explicit expansion; the binding edge adds no separate lifecycle semantics.

Language tools should:

- complete compatible callable props after `valueProp:` on an eXact component;
- complete only the finite supported endpoints on standard intrinsics;
- filter callback candidates whose first parameter cannot flow back to the target type;
- show the conceptual two-prop expansion and write ordering on hover;
- identify parent state ownership and child callback provenance;
- rename value and callback props through the paired use;
- show both enhancement and binding candidates before resolution; and
- provide actionable ambiguity diagnostics with explicit expansion/namespace-alias repairs.

## Lazy activation, SSR, and hydration

The shorthand must not broaden event replay by itself. The compiler analyzes the synthesized
callback's state write, interaction attachment, captures, placement, and ordinary boundary
ownership exactly as if the explicit callback were authored. A child callback that can run before a
lazy parent state owner exists makes the relevant boundary eager unless the lazy-island proposal
proves an equivalent restorable owner and event policy.

SSR emits the value prop through normal component or intrinsic rendering. Callback behavior remains
in the artifact where the explicit callback would live. Hydration adopts dirty controls through the
existing binding contract before publishing or overwriting user state. Component callback lifetime
and stale-reference behavior are exactly those of explicit source; shorthand adds no separate
guard.

No public transport or hydration identity is derived from `valueProp`, `callbackProp`, intrinsic
event names, or source spelling. Existing opaque operation and boundary identities remain
authoritative.

## Delivery order

1. Add normalized semantic analysis and diagnostics for component value/callback pairs without
   changing generated output.
2. Lower valid component pairs to ordinary value and callback props with parent-owned state writes,
   using the exact explicit-lambda analysis path.
3. Add duplicate-generated-prop, interaction/task, placement, and enhancement-ambiguity diagnostics.
4. Add completion, hover, rename, and source inspection.
5. Replace the abbreviated intrinsic spellings with canonical `value:onInput`, `value:onChange`, and
   `checked:onChange` forms over the existing adapters, then update every repository use atomically.
6. Add `details` `open:onToggle`, exclusive-group agreement, and authored-handler ordering.
7. Verify the settled endpoint-only platform policy, SSR, dirty hydration adoption, Activity, and
   lazy activation behavior.
8. Update current references, docs-app pages, examples, package guidance, reusable skill guidance,
   and compatibility/release checks.

## Verification

- Compiler fixtures prove each shorthand is semantically equivalent to its explicit value/callback
  expansion for reads, writes, evaluation order, target aliases, branches, keyed items, allocation,
  callback identity, interaction attachment, and cleanup.
- Type tests cover optional callbacks, additional parameters, nullable values, variance in both
  directions, overload ambiguity, invalid return contracts, non-writable targets, computed paths,
  open prop dictionaries, and duplicate generated props.
- Duplicate-prop tests reject an explicit value prop, an explicit callback prop, two shorthands that
  generate one callback prop, and finite spreads proven to contain either generated prop. Explicit
  source remains available for logging, veto, transformation, or asynchronous semantics.
- Ownership tests prove the parent remains the only state owner, child props remain immutable, and
  shorthand callback lifetime is indistinguishable from the equivalent explicit lambda across
  replacement, unmount, keyed branches, Suspense, and Activity.
- Placement and continuation tests compare shorthand and explicit source across client, server,
  distributed, secret, serialization, and unsupported callback boundaries.
- Enhancement tests cover normal kebab-case/camelCase separation, true collisions, aliases,
  activators, shared props, completion, and diagnostics that name both candidates without choosing
  precedence.
- Intrinsic tests cover text, number, date, range, nullable values, textarea, select, multi-select,
  checkbox boolean, radio values, checkbox arrays, and unsupported input types.
- Details tests cover user toggles, state-driven toggles, coalesced events, named exclusive groups,
  authored `onToggle`, hydration, Activity, and feedback-loop suppression.
- DOM ordering tests prove intrinsic state publication occurs before authored endpoint handlers;
  component duplicate props never enter an ordering or composition path.
- Reset, autofill, restoration, dirty-control, SSR, and hydration tests protect browser-owned values
  without synthesizing events or overwriting pre-hydration edits.
- Lazy-island tests prove generated callbacks have the same eligibility, captures, ownership, and
  queued-activation behavior as explicit lambdas.
- Repository searches and compiler fixtures prove every use has moved to the canonical intrinsic
  spellings. Negative tests exercise the ordinary unsupported namespaced-attribute path without
  asserting a legacy-specific diagnostic or migration suggestion.
- Documentation checks keep engineering references, public docs, examples, package guides, and the
  reusable skill synchronized when implementation lands.

## Acceptance criteria

1. `valueProp:callbackProp={statePath}` is exactly equivalent to the supported explicit value prop
   plus unconditional first-parameter assignment callback.
2. Parent state ownership, child prop immutability, inspectability, interaction/task attachment,
   callback identity, allocation, cleanup, and lifetime are exactly those of explicit source.
3. Components need no binding metadata, naming convention, wrapper value, setter prop, writable
   prop proxy, channel, or runtime registry beyond their existing finite prop types.
4. Supplying either generated prop explicitly is a duplicate-prop compiler error; component
   shorthand never composes callbacks.
5. Non-writable targets, incompatible directions, ambiguous overloads, semantic return protocols,
   and illegal placement or serialization fail with source-located diagnostics.
6. `value:onInput`, `value:onChange`, and `checked:onChange` replace the abbreviated intrinsic
   spellings directly; the compiler contains no compatibility recognition or mitigation for the
   previous names.
7. `open:onToggle` supports `details` disclosure and exclusive groups without generalizing dialog,
   popover, media, content-editing, file, scroll, or selection state.
8. Intrinsic bindings retain specialized conversion, dirty-control, SSR/hydration, event-ordering,
   endpoint-only platform observation, and authored-handler behavior.
9. Enhancement and component-binding ambiguity always fails with both interpretations and explicit
   repair options; casing heuristics never silently choose semantics.
10. Lazy activation and distributed compilation treat generated callbacks exactly like their
    explicit source expansion and add no public transport identity.
