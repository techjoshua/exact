# Accessibility enhancements and diagnostics

## Status

**Implemented.** The public capabilities, native-platform boundary, component and analyzer
ownership, value shapes, and lifecycle rules were delivered in `@exactjs/accessibility`, core
intrinsic lowering, DOM, SSR, hydration, and the generic language-extension host. The current
normative contract is [Accessibility](../accessibility.md); this record preserves the delivery
rationale and rejected designs.

This proposal depends on the implemented enhancement-component contract, `_target` routing,
package-scoped enhancement exports, compiler-owned intrinsic bindings, renderer publication,
hydration adoption, refs, and trusted language-service contributions. It adds one small core
intrinsic binding for modal dialogs and one independently shipped enhancement package. Neither the
compiler nor the language server learns accessibility-package semantics.

## Decision

Create `@exactjs/accessibility`, conventionally imported as the `a11y` enhancement namespace. Its
runtime scope is deliberately narrow:

- focus entry and restoration around a bounded region;
- keyboard focus management for authored ARIA composite widgets; and
- ref-based publication of ARIA ID relationships.

Use native HTML for semantics and behavior that browsers already implement. In particular, native
`dialog`, `popover`, controls, labels, `status`, `alert`, `log`, `progressbar`, `aria-live`,
`:focus-visible`, media queries, and ordinary DOM events remain authoritative. The package does not
replace them with parallel framework systems.

The package also publishes declarative language metadata and a trusted analyzer through the generic
[language-extension protocol](trusted-language-service-contributions.md). Those contributions
provide accessibility diagnostics, explanations, completions, hovers, and safe edits only where the
package is relevant to the current source. They never transform compiler output.

## Authoring and package activation

An individual component opts in with the ordinary attributed namespace import:

```tsx
import * as a11y from '@exactjs/accessibility/enhancements'
	with { type: 'exact-enhancement' };
```

A package that wants the namespace and its language provider in every compiled component exports it
from its owning `exact.config.ts`:

```ts
// prettier-ignore
export * as a11y from '@exactjs/accessibility/enhancements' with { type: 'exact-enhancement', scope: 'package' };
```

The normal enhancement namespace collision rule applies. A component-local attributed import named
`a11y` conflicts with the package-scoped `a11y` binding as though both declarations appeared in the
same file. It does not silently shadow or replace the package binding.

The package's enhancement components are ordinary compiler-built, compiler-branded eXact
components. There is no compilerless component implementation, React-shaped wrapper, special
component classifier, or browser-loaded analyzer. The package exports the compiled components from
its enhancement entry using the normal canonical activator metadata.

A component-library author may build and validate a component with the package even when a
consuming application does not activate that enhancement. The authored intrinsic output is the
fallback. This is the standard enhancement contract, not an accessibility-specific
`optional`/`required` mode. The consuming application does not install or execute an analyzer that
is absent from its resolved package graph.

## Implementation ownership

| Concern                                                               | Owner                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| `modal:isOpen` analysis and lowering                                  | Core compiler intrinsic-binding domain                   |
| Modal DOM method calls, event write-back, and live-state adoption     | DOM renderer and hydration runtime                       |
| Generic ref-key-to-element ID reservation                             | Core renderer identity domain                            |
| Focus, relationship, and navigation sessions                          | `@exactjs/accessibility` compiled enhancement components |
| HTML/ARIA tables and accessibility rules                              | `@exactjs/accessibility` language contribution           |
| Provider discovery, trust, execution, and compilation gate            | Generic language-extension host                          |
| Localized scalar text and catalog validation                          | `@exactjs/intl` and its language contribution            |
| Native semantics, top layer, focus trap, inertness, and announcements | Browser and assistive technology                         |

The compiler's only new domain knowledge is the generic source contract of the intrinsic
`modal:isOpen` binding, analogous to its existing finite intrinsic bindings. It contains no package
name, ARIA rule table, composite role policy, or accessibility-provider callback.

## Native platform boundary

### Modal dialogs

Core adds one compiler-owned writable intrinsic binding:

```tsx
<dialog modal:isOpen={this.state.settingsOpen}>...</dialog>
```

`modal:isOpen` is valid only on `dialog` and only with a writable boolean state location. It owns
the native modal state:

- a committed `true` calls `showModal()` when the dialog is not already modal;
- a committed `false` calls `close()` when the dialog is open;
- native close or toggle completion publishes the final modal-open state back to the bound state;
- hydration adopts a compatible live modal state before normal reactive writes; and
- disposal removes only listeners owned by the binding and never closes a dialog merely because
  its component is being released.

SSR does not emit `open` merely because the bound state is true: serialized markup cannot place a
dialog in the browser's modal top layer, and an `open` dialog would instead be nonmodal. During
hydration, an already-modal dialog opened by a native pre-hydration command writes `true` into state.
Otherwise, a bound true state calls `showModal()` after the owning generation publishes. The
runtime handles an already-open nonmodal dialog as incompatible state and reports the binding
conflict; it does not silently convert authored nonmodal ownership into modal ownership.

The compiler rejects `modal:isOpen` combined with an authored `open` prop or another owner of the
same dialog-open state. An ordinary `open` attribute means nonmodal display and is not equivalent to
`showModal()`. The binding does not emulate a modal using an attribute, role, focus trap, or
application-managed `inert` tree.

Standard command invokers remain the preferred no-handler control surface:

```tsx
<button commandFor="settings-dialog" command="show-modal">Settings</button>
<dialog id="settings-dialog" modal:isOpen={this.state.settingsOpen}>
	<button commandFor="settings-dialog" command="request-close">Cancel</button>
	<button commandFor="settings-dialog" command="close">Save</button>
</dialog>
```

Core JSX types expose the finite native command values it supports. The accessibility provider
validates statically resolvable `commandFor` targets, command/target compatibility, accessible
names, and dialog labelling. Dynamic targets remain explicitly unproven, not erroneous.

`@exactjs/accessibility` does not implement modal containment or background inertness. Authors use
native modal `dialog`; appropriate nonmodal overlays use native `popover`. The analyzer warns when
it can prove that a custom `role="dialog"` is being used as a modal substitute and explains the
native alternative.

### Native live regions and input behavior

There is no `a11y:live`, `a11y:atomic`, `a11y:announce-initial`, locale-announcement coordinator,
or framework live-region scheduler. Authors use native live-region roles and ARIA properties. The
analyzer explains urgency, atomicity, naming, and common role/property mistakes, but the framework
makes no promise about how often assistive technology speaks an update.

A future imperative `ariaNotify` facade may be proposed if native implementations become suitable
for application events that have no visible live region. It is not part of this proposal.

There is no `a11y:modality`, global input-modality context, or document-wide pointer/keyboard
listener. Authors use `:focus-visible`, native keyboard and pointer events, hover/focus media
queries, and `@exactjs/gestures`. The analyzer diagnoses provable keyboard-access failures and
explains native alternatives.

There is no accessibility `LanguageContext` and no dependency on `LocalizationContext`. Browsers
and assistive technologies already resolve text direction. A composite-navigation coordinator may
read `getComputedStyle(target).direction` locally only when its own role-specific left/right
algorithm must interpret physical direction. It does not cache direction globally, monitor locale
changes, or coordinate announcements with intl.

## Enhancement surface

### Focus lifecycle

```tsx
import { createRef, type Component } from '@exactjs/core';

const firstFieldKey = createRef<HTMLInputElement>('first settings field');
const openerKey = createRef<HTMLButtonElement>('settings opener');

function Settings(this: Component<{ visible: boolean }>) {
	const firstField = this.ref(firstFieldKey);
	const opener = this.ref(openerKey);

	return () => (
		<>
			<button ref={opener}>Edit settings</button>
			{this.state.visible && (
				<section a11y:focusScope a11y:initialFocus={firstField} a11y:returnFocus={opener}>
					<input ref={firstField} />
				</section>
			)}
		</>
	);
}
```

The canonical enhancement group has these props:

```ts
interface FocusScopeProps {
	readonly focusScope?: true;
	readonly initialFocus?: RefBinding<HTMLElement>;
	readonly returnFocus?: RefBinding<HTMLElement> | false;
}
```

`initialFocus` and `returnFocus` require `focusScope`. The values are stable component-owned
`RefBinding` objects returned by `this.ref(createRef(...))`; arbitrary `this.refs.name` properties
do not exist.

After the scope's first committed browser publication, `initialFocus` focuses its connected,
eligible target. Without it, a native dialog retains the browser's autofocus algorithm and an
ordinary region does not invent an initial target. Hydration adoption alone never moves focus.

The scope captures the connected `document.activeElement` when its focus session actually begins.
On normal deactivation it restores that element if it remains connected, focus is still inside the
scope or was displaced by the scope, and no newer nested scope owns restoration. It must not steal
focus back after the user has deliberately moved elsewhere. An explicit `returnFocus` replaces the
captured target; `false` disables restoration. The explicit target is not required merely to get
correct opener restoration.

On `dialog`, the session begins and ends with native modal opening and closing. The enhancement may
add initial-focus and restoration behavior but never duplicates the dialog's trap, top-layer,
Escape, or inertness behavior. On any other element it owns only focus entry/restoration around the
element's mounted lifetime. Nested scopes form a stack, generation-fence stale publications, and
release their listeners and restoration authority on disposal.

### ARIA relationships

Ref-based relationships cover every ARIA ID-reference property, including the properties whose
semantics require extra caution:

```tsx
const label = this.ref(labelKey);
const help = this.ref(helpKey);

<span ref={label}>Delete selected messages</span>
<span ref={help}>This action cannot be undone.</span>
<button
	aria-label={`Delete ${this.state.count} messages`}
	intl:aria-label="plural:cardinal"
	a11y:labelledBy={label}
	a11y:describedBy={[help]}
>
	<TrashIcon aria-hidden="true" />
</button>
```

The public prop types are:

```ts
type AriaRef = RefBinding<Element>;
type OptionalAriaRef = AriaRef | false | null | undefined;
type AriaRefList = AriaRef | readonly AriaRef[] | false | null | undefined;

interface AriaRelationshipProps {
	readonly activeDescendant?: OptionalAriaRef;
	readonly controls?: AriaRefList;
	readonly describedBy?: AriaRefList;
	readonly details?: OptionalAriaRef;
	readonly errorMessage?: OptionalAriaRef;
	readonly flowTo?: AriaRefList;
	readonly labelledBy?: AriaRefList;
	readonly owns?: AriaRefList;
}
```

These map respectively to `aria-activedescendant`, `aria-controls`, `aria-describedby`,
`aria-details`, `aria-errormessage`, `aria-flowto`, `aria-labelledby`, and `aria-owns`. Arrays retain
authored order and are deduplicated by resolved element identity. Empty arrays and false/nullish
values remove only the relationship value owned by that enhancement activation.

After publication, the coordinator reuses each referenced element's valid authored `id`. If an
element has none, it assigns `exact-${crypto.randomUUID()}`. The same generated ID is reused by all
relationships to that node and remains on the element for its lifetime; it is not removed when a
relationship deactivates. If SSR resolves the ref, the server emits the generated ID and
relationship and hydration adopts both. A client-only target receives them after publication.
Authored IDs always win, and a later authored ID change causes the owned relationship to republish.

SSR resolution uses a generic renderer identity registry keyed by component owner and `RefKey`; it
does not fabricate an `Element`, execute browser code, or teach the compiler about ARIA. Because a
later streamed sibling may consume an earlier ref, the server reserves and emits stable identity
for every ref-bearing intrinsic that has no authored ID. A relationship enhancement writes that
same reserved token on its target. The hydrator seeds the browser-side registry from those adopted
nodes. Any enhancement or framework feature that needs stable ref-addressed element identity may
use this internal service; ARIA does not own a parallel implementation.

The enhancement does not remove scalar fallbacks. `aria-labelledby` may coexist with `aria-label`,
and `aria-describedby` may coexist with `aria-description`; native accessible-name precedence
selects the effective value. This lets a component library support applications that activate
different enhancement sets without emitting conditional markup.

The analyzer applies relationship-specific rules rather than treating every ID list alike. It
checks, where finite, active-descendant ownership and membership, controls target suitability,
details/errormessage cardinality, `aria-invalid` coordination, flow cycles, labelled/described name
quality, and `aria-owns` cycles or multiple owners. It never searches through opaque component
implementations to manufacture certainty.

### Composite navigation

```tsx
<ul role="listbox" aria-label="Assignee" a11y:navigate>
	{this.map(
		this.state.people,
		(person) => person.id,
		(person) => (
			<li role="option">{person.name}</li>
		)
	)}
</ul>
```

The single activator deliberately keeps the common case terse:

```ts
type NavigateOrientation = 'horizontal' | 'vertical' | 'both';

type NavigateOptions = {
	readonly mode?: 'roving' | 'activeDescendant';
	readonly orientation?: NavigateOrientation;
	readonly wrap?: boolean;
	readonly homeEnd?: boolean;
	readonly pageSize?: number;
};

interface CompositeNavigationProps {
	readonly navigate?: true | NavigateOptions;
}
```

`true` means `{ mode: 'roving' }` with role-derived defaults. `pageSize` is a positive integer and
enables PageUp/PageDown by that many eligible items. `homeEnd` defaults to true. `wrap` defaults to
the role pattern's APG convention; if the pattern has no single convention it defaults to false and
the hover explains the choice.

The target must have one statically known supported composite role. The first implementation owns
these complete policies rather than a generic arrow-key switch:

| Container role     | Eligible owned roles | Default orientation              | Additional required behavior                            |
| ------------------ | -------------------- | -------------------------------- | ------------------------------------------------------- |
| `tablist`          | `tab`                | `aria-orientation` or horizontal | focus only; activation remains authored                 |
| `listbox`          | `option`             | `aria-orientation` or vertical   | focus only; selection remains authored                  |
| `radiogroup`       | `radio`              | both                             | checked state remains authored                          |
| `toolbar`          | focusable controls   | `aria-orientation` or horizontal | nested arrow-owning widgets are skipped                 |
| `menu`, `menubar`  | menuitem roles       | vertical / horizontal            | submenu keys follow the APG pattern                     |
| `tree`             | `treeitem`           | vertical                         | left/right collapse, expand, parent, and child behavior |
| `grid`, `treegrid` | row/cell roles       | both                             | row/column movement and editing-mode boundaries         |

The implementation must either implement the listed role policy completely or reject that role in
its published finite vocabulary. It must not claim support while providing only linear arrow
movement. Native controls are never enrolled merely because they are descendants of a composite.

Roving mode keeps exactly one eligible item at `tabIndex=0` and moves DOM focus. Active-descendant
mode keeps focus on the container, assigns/reuses an ID for the active item, and owns the
container's `aria-activedescendant`. It conflicts with an authored `aria-activedescendant` or
`a11y:activeDescendant`; the analyzer reports that duplicate ownership. Neither mode changes
selection, checked state, tab activation, or application data unless the role's keyboard pattern
defines that action and the author supplies the corresponding action contract.

Eligibility is derived from the supported role policy, connection, hidden/inert state, disabled
state, and focusability requirements. Active identity follows the same DOM node, then a stable
nonempty ID, across rescans. When the active item disappears, the nearest surviving item in logical
order becomes active; an empty composite retains only its container tab stop.

Each active navigation coordinator owns one bounded `MutationObserver` on its target subtree. Its
attribute filter is limited to facts used for eligibility and identity, such as `role`, `id`,
`hidden`, `inert`, `disabled`, `aria-disabled`, `tabindex`, `class`, and `style`; coordinator-owned
`tabindex` and ID writes are ignored. It also rescans synchronously before handling a navigation
key, so a missed CSS or renderer change cannot direct focus to a stale item. Disposal disconnects
the observer. No renderer-wide child-publication notification or document-wide observer is added.

Ordered previous/next patterns follow logical eligible order as defined by the APG pattern. They do
not reverse simply because text is RTL. A genuinely spatial left/right policy, such as grid cell
movement, may read `getComputedStyle(target).direction` at the decision point to interpret physical
direction. This is local DOM information, not localization coordination.

## Accessibility language provider

The provider participates only through the generic trusted language-extension host. An attributed
component import activates it for that source; a package-scoped config export activates it for all
owned components. Removing the final relevant activation releases the provider according to the
shared host lifecycle. The analyzer never runs in a browser or inside the compiler/LSP process.

Generated ARIA and HTML tables record their upstream specification revision and source URL.
Handwritten data is limited to eXact enhancement composition rules. Updating generated tables must
produce a reviewable diff and run a drift check; runtime code must not duplicate those tables.

### Severity model

- **Error:** a finite source fact violates the enhancement/component contract or would make the
  compiler unable to preserve the requested behavior.
- **Warning:** finite source strongly indicates an accessibility failure, but a legitimate dynamic
  or application-specific exception can exist.
- **Advisory:** explanatory guidance or a safer native alternative; it never fails a build.

Every result has a stable package-qualified code, precise primary span, related spans where useful,
confidence/reason data, and a documentation link. Enabled errors participate in the shared
compilation validation gate. Ignoring the provider or one of its roles uses the generic
`languageExtensions` configuration and affects LSP/CI consistently; there is no separate a11y
ignore mechanism.

### Required analysis

The first release checks all finite cases in these groups:

1. ARIA property names, token values, cardinality, and compatibility with known intrinsic elements
   and roles.
2. Duplicate static IDs and statically resolvable native or enhancement ID references.
3. Accessible-name sources for native controls, dialogs, landmarks, and supported composite items.
4. `label[for]`, wrapping labels, `alt`, localized scalar properties, and relationship fallbacks.
5. Positive `tabIndex`, click-like non-native targets without keyboard activation, and gesture
   targets without a compatible focus/keyboard policy.
6. Enhancement target compatibility, required companion props, duplicate ownership, unresolved
   `_target`, ref element types, and single-versus-list relationship shapes.
7. Native dialog usage, `modal:isOpen`, `open`, `commandFor`, `command`, labelling, initial focus,
   and restoration combinations.
8. Composite role/child structure, orientation, ownership, nested arrow-key conflicts, selection
   responsibilities, and the complete role policy advertised by `a11y:navigate`.
9. Native live-region roles and properties, including redundant/conflicting urgency, missing names
   where required, and explanations that announcement timing is assistive-technology-owned.
10. Pointer-only, hover-only, or drag-only interactions when an equivalent keyboard/focus path is
    provably absent, coordinated with gesture and motion contribution facts.
11. Prefer-native advisories for provable custom substitutes for buttons, links, dialogs, popovers,
    disclosure controls, and other well-supported native elements.

The provider must not claim that a dynamic expression is empty, that an opaque component lacks an
accessible name, that a runtime-created target is absent, that a color combination fails without
computed styles, or that a screen reader will announce a particular sequence. Uncertainty is
reported in hover/reason data such as `dynamic-name`, `opaque-target`, or `runtime-id`; it is not
converted into a speculative error.

### Editor features and code actions

Completions expose finite ARIA tokens, compatible relationship props, supported navigation modes,
native command values, and role-specific options. Hovers explain effective accessible-name
precedence, relationship cardinality, native behavior, inferred navigation defaults, ownership,
and why a fact could not be proven. Inlays are reserved for useful inferred policy, not repeated
labels on every ARIA attribute.

Safe code actions may connect an already-existing label/ID, replace a deprecated finite token, add
an already-proven missing companion attribute, or import an already-used namespace. A
behavior-changing action must say so. The provider never invents human-facing label text, chooses a
role, creates application selection logic, installs a dependency, or rewrites a custom widget into
a native element without explicit author action.

## Internationalization coordination

`@exactjs/intl` remains the sole owner of localized scalar properties such as `alt`, `title`,
`placeholder`, `aria-label`, `aria-description`, `aria-roledescription`, and `aria-valuetext`.
Accessibility consumes their final DOM semantics and never translates or rewrites their text.

For a localized accessible property, the accessibility analyzer counts the intl activator as a
possible name/description source only when its required authored fallback property is also present.
It validates the accessible shape but does not read catalogs. The intl provider validates message
inference, placeholders, targets, source fallback, and locale coverage. An empty translated value
for a semantically required accessible property remains an intl catalog error with fallback
retention, not a second accessibility writer.

ARIA identity properties are never translation messages. Ref-based relationships may coexist with
localized scalar fallbacks, and the browser applies standard accessible-name precedence. Intl does
not recognize or suppress arbitrary enhancement identities; accessibility does not suppress intl
output.

Intl may reorder marked message fragments. Navigation and relationship coordinators retain DOM/ref
identity rather than caching source-order paths and rescan their bounded targets after observable
DOM changes. Locale changes do not move focus, trigger framework announcements, or require an
accessibility language context.

## SSR, hydration, and lifecycle

SSR emits authored semantic attributes, localized scalar fallbacks, and relationship IDs it can
resolve through the generic ref identity registry. It never serializes modal top-layer state as an
`open` attribute. It also does not serialize DOM nodes, focus history, active keyboard sessions,
observers, or assistive-technology state. Hydration adopts compatible emitted IDs and live native
control/dialog state before activating browser-owned coordination.

Passive hydration never moves focus. A newly opened modal or newly mounted focus scope may move
focus only after its owning generation publishes. Live pre-hydration focus is preserved when still
compatible. Mismatch recovery is bounded to the owning render range and fences stale focus,
relationship, and navigation work.

Every runtime coordinator has one durable component owner and releases event listeners, observers,
tab-index ownership, and pending focus authority on deactivation or disposal. Generated IDs remain
because they are harmless stable identity, but an owned ARIA relationship or `tabindex` value is
removed only if the DOM still contains the exact value written by that owner.

## Testing

Protection is layered by boundary:

- generated-table and declarative-provider tests cover schema drift, roles, properties, tokens,
  target types, and relationship cardinality;
- analyzer fixtures cover every diagnostic severity, finite proof, uncertainty reason, completion,
  hover, and safe edit;
- LSP/CLI/build parity tests feed identical projections and compare provider-qualified results;
- component tests cover nested focus restoration, ref replacement, permanent generated IDs,
  relationship deactivation, roving focus, active descendant, disabled items, role policies,
  bounded mutation observation, and disposal;
- compiler tests cover `modal:isOpen` typing, lowering, write-back, conflict diagnostics, SSR facts,
  and absence of any accessibility-package branch;
- DOM, SSR, and hydration tests cover native dialog commands, modal adoption, initial focus,
  generated relationship IDs, stale generations, and mismatch recovery;
- intl, forms, gesture, and motion integration tests cover localized scalar/relationship
  coexistence, reordered fragments, labelled fields, keyboard-equivalent gestures, and reduced
  motion without cross-package writers;
- browser accessibility-tree tests verify representative names, descriptions, roles, states, and
  relationships; and
- manual assistive-technology coverage records representative Windows and Apple combinations for
  dialogs, errors, live regions, and each shipped composite policy.

APG examples are guidance, not proof of cross-browser behavior. Representative browser and
assistive-technology testing is required before a role policy is advertised as supported.

## Delivery order

1. **Language baseline:** publish generated standards data, declarative metadata, analyzer
   diagnostics, hovers/completions, uncertainty reasons, ignores, and LSP/CLI/build parity.
2. **Native dialog binding:** implement and document core `modal:isOpen`, hydration/write-back, JSX
   command typing, and provider validation without adding package semantics to the compiler.
3. **Relationships:** ship all ref-based ID properties, SSR ID reservation/adoption, permanent ID
   ownership, and relationship-specific diagnostics.
4. **Focus lifecycle:** ship entry/restoration sessions for bounded regions and native dialogs,
   including nesting and generation fencing but no custom modality.
5. **Composite navigation:** ship only role policies that pass their complete policy, observer,
   keyboard, browser, and assistive-technology suites; expand the finite vocabulary incrementally.
6. **Cross-package conformance:** prove intl, forms, gesture, and motion composition, then publish
   public docs and examples using the same APIs.

Slices may ship independently only when their public vocabulary does not claim a later capability.
For example, the analyzer may explain an unsupported tree pattern before `a11y:navigate` accepts
`role="tree"`; it must not offer the activator as though runtime behavior already exists.

## Acceptance criteria

1. Native HTML and authored ARIA remain semantic truth; the package does not reproduce browser
   modality, popover, live-region, input-modality, or text-direction systems.
2. `modal:isOpen` uses native dialog methods and state write-back, never an `open`-attribute modal
   emulation.
3. The accessibility package consists of ordinary compiler-branded eXact enhancement components
   and has no compilerless or React-shaped implementation.
4. The compiler and LSP contain no `@exactjs/accessibility` identity or package-specific analyzer
   branch.
5. Package-scoped and local activation follow the generic enhancement and language-provider rules;
   a missing package cannot execute an analyzer.
6. Focus scopes add entry/restoration only and never own modal trapping or background inertness.
7. Every ARIA ID-reference property has a typed ref enhancement, stable generated IDs, SSR adoption,
   and property-specific validation.
8. Scalar localized fallbacks and ARIA relationships coexist; intl and accessibility never become
   competing writers.
9. Composite navigation advertises only complete role patterns, uses bounded observation, and adds
   no renderer-wide or document-wide notification mechanism.
10. Language diagnostics are finite, provider-owned, confidence-aware, and identical at editor and
    compilation validation boundaries.
11. Hydration does not move focus or replay announcements, and stale generations cannot publish
    focus, relationship, or navigation state.
12. Removing the package and its attributed activations leaves ordinary eXact, TypeScript, HTML,
    intl, forms, gesture, and motion behavior unchanged.

## Explicitly rejected designs

An implementation is nonconforming if it introduces any of these without a new proposal:

- mandatory/optional/native enhancement classifications;
- compiler or LSP visitors registered by the package;
- compilerless accessibility component substitutes;
- custom modal focus trapping or background inertness;
- live-region scheduling, temporary `aria-atomic` mutation, or locale announcement suppression;
- global input-modality listeners or an `a11y:modality` state channel;
- `LanguageContext`, `LocalizationContext` coupling, or global direction tracking;
- a generic renderer child-publication hook for navigation;
- document-wide mutation observers;
- removal of generated IDs merely because one relationship ended; or
- suppression of localized scalar ARIA fallbacks when a relationship has higher precedence.
