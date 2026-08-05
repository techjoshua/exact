# Component value/callback binding shorthand

## Status

Proposed after
[`enhancements-as-component-composition.md`](enhancements-as-component-composition.md) and before
[`lazy-interaction-islands.md`](lazy-interaction-islands.md),
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md), and
[`partial-prerender-resumption.md`](partial-prerender-resumption.md). It can be implemented
independently of
[`server-component-library-trust.md`](server-component-library-trust.md) and
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md), but all
three proposals precede the broader lazy-island delivery in the repository queue. Lazy eligibility
and event replay must analyze the generated callback exactly as they analyze its explicit source
equivalent.

The repository's strict execution sequence schedules this proposal after internationalization even
though there is no technical dependency between them. That ordering avoids simultaneous changes to
the settled enhancement syntax and gives lazy islands one completed value/callback contract to
consume.

This proposal depends on the enhancement proposal's final namespaced-JSX and kebab-case resolution
rules. A namespaced attribute that could denote either an enhancement member or a component binding
must fail with an ambiguity diagnostic; neither feature receives silent precedence.

| Area                        | Current form                                        | Proposed form                                  |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| Component controlled value  | Explicit value prop plus mechanical change callback | `valueProp:callbackProp={statePath}`           |
| Text-like intrinsic binding | `value:input`                                       | `value:onInput`                                |
| Committed intrinsic binding | `value:change`                                      | `value:onChange`                               |
| Checkbox/radio binding      | `checked:change`                                    | `checked:onChange`                             |
| Details disclosure binding  | Explicit `open` plus `onToggle` state update        | `open:onToggle`                                |
| Authored notification       | Intrinsic binding runs before same-event handler    | Same rule for intrinsic and component bindings |
| Runtime abstraction         | DOM-specific compiler binding markers               | No new component runtime abstraction           |
| State ownership             | Parent owns the writable state path                 | Unchanged                                      |

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
value-plus-callback expansion requires. When the target path and authored callback identity are
stable, the compiler should create one setup-owned callback per component instance rather than a
new closure on each reactive publication. Composing an authored callback may produce one combined
callback, but must not retain the original JSX node or a second callback wrapper chain. The value
read and generated assignment should participate in the same compiler-known dependency slot as an
equivalent explicit controlled prop; binding shorthand must not force the generic proxy-tracking
path or make an otherwise lazy interaction island eager.

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
parameters are permitted and ignored by the synthesized assignment unless an authored callback is
also present, in which case they are forwarded unchanged.

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

### Authored callback composition

Allow an explicit callback prop beside its binding shorthand:

```tsx
<Dialog
	open:onOpenChanged={this.state.dialogOpen}
	onOpenChanged={(open, reason) => {
		this.log.info('dialog changed', { open, reason });
	}}
/>
```

The compiler composes one stable callback equivalent to:

```tsx
onOpenChanged={(open, reason) => {
	this.state.dialogOpen = open;
	this.log.info('dialog changed', { open, reason });
}}
```

The binding write always publishes first. The authored callback then receives every original
argument in order and runs in the same interaction or task context. If it throws, the state write
is not automatically rolled back; ordinary error-boundary and task behavior applies. Callers that
need validation, veto, transformation, or transactional rollback must author the complete callback
without binding shorthand.

An explicit value prop still conflicts with the shorthand because the shorthand already supplies
that value:

```tsx
// Diagnostic: `open` is supplied twice.
<Dialog open:onOpenChanged={this.state.dialogOpen} open={true} />
```

One callback prop cannot serve two binding shorthands at the same boundary. A finite spread proven
to contain either generated prop is diagnosed in the first delivery; opaque spreads cannot be used
to evade duplicate-prop or callback-composition checks. A later extension may compose a statically
extractable callback from a finite spread only if it preserves source-order evaluation and stable
identity.

### Generated callback ownership

The generated callback belongs to the parent component and the authored JSX boundary. It must have
stable identity across value updates, preserve keyed item and branch ownership, participate in the
current interaction/task when invoked, and become unusable after its owning boundary generation is
released. The compiler must not allocate a fresh function merely because the bound value changes.

No new cross-host callback transport is introduced. If the explicit value-plus-callback expansion
cannot cross a client/server boundary under current component continuation rules, the shorthand
receives the same diagnostic. Generated operation identity, when current lowering already requires
one, remains opaque and generation-fenced.

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
affected bound member must publish the browser-selected result without a feedback loop.

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

The implementation must audit uncancelled form reset, browser-restored control state, autofill, and
hydration-dirty controls. Platform changes that do not dispatch the selected endpoint cannot leave
the binding silently inconsistent. The resulting policy must reuse the existing control ownership
and adoption mechanisms rather than synthesize untrusted events.

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
- JSX boundary and generation;
- value prop and callback prop identities;
- callback first-parameter type and additional argument contract;
- optional authored callback composition;
- placement and artifact targets; and
- intrinsic adapter identity where applicable.

Generated code may reuse existing prop callback and DOM binding machinery, but inspection and
diagnostics should preserve the authored paired syntax rather than expose helper names.

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
callback's state write, interaction attachment, captures, placement, and target generation exactly
as if the explicit callback were authored. A child callback that can run before a lazy parent state
owner exists makes the relevant boundary eager unless the preceding lazy-island proposal proves an
equivalent restorable owner and event policy.

SSR emits the value prop through normal component or intrinsic rendering. Callback behavior remains
in the artifact where the explicit callback would live. Hydration adopts dirty controls through the
existing binding contract before publishing or overwriting user state, and component callbacks
cannot address a stale parent generation after replacement.

No public transport or hydration identity is derived from `valueProp`, `callbackProp`, intrinsic
event names, or source spelling. Existing opaque operation and boundary identities remain
authoritative.

## Delivery order

1. Add normalized semantic analysis and diagnostics for component value/callback pairs without
   changing generated output.
2. Lower valid component pairs to stable ordinary value and callback props with parent-owned state
   writes.
3. Add authored callback composition, argument forwarding, interaction/task attachment, and stale
   generation fencing.
4. Add completion, hover, rename, source inspection, and enhancement ambiguity diagnostics.
5. Replace the abbreviated intrinsic spellings with canonical `value:onInput`, `value:onChange`, and
   `checked:onChange` forms over the existing adapters, then update every repository use atomically.
6. Add `details` `open:onToggle`, exclusive-group agreement, and authored-handler ordering.
7. Audit form reset, restoration, autofill, SSR, hydration, Activity, and lazy activation behavior.
8. Update current references, docs-app pages, examples, package guidance, reusable skill guidance,
   and compatibility/release checks.

## Verification

- Compiler fixtures prove each shorthand is semantically equivalent to its explicit value/callback
  expansion for reads, writes, evaluation order, target aliases, branches, keyed items, and stable
  callback identity.
- Type tests cover optional callbacks, additional parameters, nullable values, variance in both
  directions, overload ambiguity, invalid return contracts, non-writable targets, computed paths,
  open prop dictionaries, and duplicate generated props.
- Callback tests prove the binding write precedes an authored handler, all arguments are forwarded,
  errors retain the completed state write, and explicit source remains available for veto or
  transformation semantics.
- Ownership tests prove the parent remains the only state owner, child props remain immutable, and
  stale callbacks cannot update replaced, unmounted, keyed-out, Suspense-discarded, or inactive
  generations.
- Placement and continuation tests compare shorthand and explicit source across client, server,
  distributed, secret, serialization, and unsupported callback boundaries.
- Enhancement tests cover normal kebab-case/camelCase separation, true collisions, aliases,
  activators, shared props, completion, and diagnostics that name both candidates without choosing
  precedence.
- Intrinsic tests cover text, number, date, range, nullable values, textarea, select, multi-select,
  checkbox boolean, radio values, checkbox arrays, and unsupported input types.
- Details tests cover user toggles, state-driven toggles, coalesced events, named exclusive groups,
  authored `onToggle`, hydration, Activity, and feedback-loop suppression.
- DOM ordering tests prove intrinsic state publication occurs before authored endpoint handlers and
  component composition follows the same ordering.
- Reset, autofill, restoration, dirty-control, SSR, and hydration tests protect browser-owned values
  without synthesizing events or overwriting pre-hydration edits.
- Lazy-island tests prove generated callbacks neither bypass event eligibility nor duplicate parent
  setup and that queued activation cannot publish into a stale target.
- Repository searches and compiler fixtures prove every use has moved to the canonical intrinsic
  spellings. Negative tests exercise the ordinary unsupported namespaced-attribute path without
  asserting a legacy-specific diagnostic or migration suggestion.
- Documentation checks keep engineering references, public docs, examples, package guides, and the
  reusable skill synchronized when implementation lands.

## Acceptance criteria

1. `valueProp:callbackProp={statePath}` is exactly equivalent to the supported explicit value prop
   plus unconditional first-parameter assignment callback.
2. Parent state ownership, child prop immutability, inspectability, interaction/task attachment, and
   generation fencing are unchanged.
3. Components need no binding metadata, naming convention, wrapper value, setter prop, writable
   prop proxy, channel, or runtime registry beyond their existing finite prop types.
4. An authored callback can coexist and always runs after the bound state write with its complete
   original argument list.
5. Non-writable targets, incompatible directions, ambiguous overloads, semantic return protocols,
   and illegal placement or serialization fail with source-located diagnostics.
6. `value:onInput`, `value:onChange`, and `checked:onChange` replace the abbreviated intrinsic
   spellings directly; the compiler contains no compatibility recognition or mitigation for the
   previous names.
7. `open:onToggle` supports `details` disclosure and exclusive groups without generalizing dialog,
   popover, media, content-editing, file, scroll, or selection state.
8. Intrinsic bindings retain specialized conversion, dirty-control, SSR/hydration, event-ordering,
   reset/restoration, and authored-handler behavior.
9. Enhancement and component-binding ambiguity always fails with both interpretations and explicit
   repair options; casing heuristics never silently choose semantics.
10. Lazy activation and distributed compilation treat generated callbacks exactly like their
    explicit source expansion and add no public transport identity.
