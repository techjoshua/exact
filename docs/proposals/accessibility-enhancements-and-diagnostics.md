# Accessibility enhancements and compiler diagnostics

## Status

**Proposed.** This document is decision-complete about ownership, enhancement composition,
internationalization coordination, diagnostics, hydration, and acceptance criteria. Public names
may change during the first package prototype, but the prototype must not weaken the boundaries in
this proposal.

This proposal builds on the implemented enhancement-component contract, `_target` routing,
compiler-owned render programs, language tools, hydration adoption, and the current accessible form,
motion, and gesture components. It does not make accessibility a framework plugin and does not
authorize packages to install compiler callbacks.

## Decision

Add an `@exactjs/accessibility` component library whose preferred authored surface is the ordinary
namespaced enhancement form:

```tsx
import a11y from '@exactjs/accessibility' with { type: 'exact-enhancement' };

<dialog
	open={this.state.open}
	a11y:focus-scope
	a11y:initial-focus=".primary"
	a11y:return-focus={this.ref.openButton}
>
	...
</dialog>;
```

The package supplies durable, inspectable enhancement components for behavior that the HTML
platform does not coordinate by itself: focus scopes, focus restoration, live announcements,
roving focus, active-descendant navigation, input-modality observation, and modal background
inertness. Explicit components remain available for compilerless callers and structural cases.

The standard compiler adds bounded accessibility diagnostics for statically provable intrinsic,
ARIA, enhancement, binding, and gesture relationships. The LSP exposes the same diagnostics,
reasons, and safe code actions. Runtime packages do not load an accessibility checker and build
hosts do not execute package-provided analysis scripts.

Accessibility behavior required for conformance is not silently optional. The generic enhancement
metadata contract gains a finite fallback classification:

- `optional` means removing the implementation leaves the authored target's documented behavior
  intact, as with visual motion;
- `required` means a reached activation must be bundled or the host fails with a source-located
  diagnostic; and
- `native` means the authored intrinsic retains a proven platform fallback and the enhancement may
  be excluded only when its declared native preconditions hold.

The accessibility package declares focus trapping, composite keyboard navigation, modal inertness,
and live announcement activators as `required`. This classification is generic enhancement
metadata, not an accessibility special case in bundlers.

## Existing baseline

The current framework already provides several relevant foundations:

- `@exactjs/forms` coordinates labels, help, error descriptions, invalid state, pending submission,
  first-invalid focus, and native form controls;
- `@exactjs/gestures` requires keyboard policy for control-like prepared gestures and treats focus as
  equivalent hover intent;
- `@exactjs/motion` makes leaving content semantically absent, handles return focus, and honors
  reduced-motion policy;
- hydration preserves dirty native form and disclosure state;
- the testing package queries elements by accessible semantics; and
- the compiler and LSP already resolve intrinsic targets, enhancement groups, component output
  frames, bindings, and source reasons.

The missing layer is shared coordination for composite widgets and application focus, plus early
diagnostics for relationships that are already finite in source.

## Goals

- Keep authored HTML, roles, labels, state, and native behavior authoritative.
- Express reusable behavior as transparent enhancement components rather than wrapper markup.
- Make focus, keyboard-session, announcement, and inertness ownership durable and inspectable.
- Preserve behavior across reactive replacement, `Activity`, `Presence`, portals, hydration, route
  publication, lazy activation, and component disposal.
- Diagnose only statically provable failures and explain uncertainty instead of guessing.
- Coordinate localized accessible properties and language direction without coupling the standard
  compiler or accessibility runtime to `@exactjs/intl`.
- Provide explicit compilerless components over the same domain coordinators.
- Prefer native elements and browser behavior whenever they already satisfy the requested contract.

## Non-goals

- Automatically making semantically incorrect markup accessible.
- Replacing native controls with a framework widget vocabulary.
- Generating accessible names when the author supplied none.
- Treating ARIA as a substitute for native element semantics.
- Running an accessibility tree, browser, or screen reader inside the compiler.
- Proving runtime-generated names, IDs, roles, child counts, focus destinations, or color contrast
  from incomplete static information.
- Letting enhancement packages register arbitrary compiler visitors or diagnostics.
- Translating strings, selecting locale, or owning bidirectional text policy.
- Shipping a general component suite for dialogs, menus, trees, grids, tabs, or listboxes in this
  proposal.

## Package and ownership boundaries

| Concern                                                         | Owner                                           |
| --------------------------------------------------------------- | ----------------------------------------------- |
| Authored semantics and native fallback                          | Application TSX and the HTML platform           |
| Focus, keyboard, announcement, and inert sessions               | `@exactjs/accessibility` enhancement components |
| Accessible field relationships                                  | `@exactjs/forms` and authored native attributes |
| Gesture recognition                                             | `@exactjs/gestures`                             |
| Visual response and reduced motion                              | `@exactjs/motion`                               |
| Translation and localized ARIA text                             | `@exactjs/intl`                                 |
| Intrinsic/ARIA correctness and finite composition checks        | Standard compiler                               |
| Editing explanations and safe corrections                       | Language server                                 |
| DOM identity, release, adoption, and physical focus application | Renderer and hydration runtime                  |

An accessibility enhancement may contribute only the properties declared by its canonical
component contract. It may not clone children, rewrite unrelated attributes, replace application
state, inspect an opaque component implementation, or search outside its bounded logical scope.
Target routing follows the existing direct-intrinsic and `_target` rules.

## Enhancement surface

The following names illustrate the accepted capability grouping. The package prototype may refine
spelling without changing ownership.

### Focus scopes

```tsx
<section
	a11y:focus-scope
	a11y:initial-focus={this.ref.firstField}
	a11y:return-focus={this.ref.trigger}
	a11y:contain="modal"
>
	...
</section>
```

One canonical `FocusScope` enhancement owns all focus-related activators on the target. It records
the previously focused connected element, resolves the initial target after the committed render,
and restores focus only when the same target generation still owns restoration. Nested scopes form
a stack. Disposal of an inner scope cannot restore focus outside an active containing scope.

`contain="modal"` traps sequential focus and coordinates background inertness. `contain="region"`
keeps programmatic restoration local but does not trap `Tab`. Native `<dialog>` behavior remains the
first choice; the enhancement fills consistent restoration, nesting, and non-modal-region gaps.

Focus application waits for renderer publication and never runs during SSR. Hydration does not move
focus merely because a scope is adopted. A newly activated modal scope may move focus after its
activation generation commits.

### Live announcements

```tsx
<output a11y:live="polite" a11y:atomic>
	{this.state.saveStatus}
</output>
```

One `LiveRegion` enhancement owns announcement scheduling. It preserves visible authored content,
adds only missing compatible live-region properties, suppresses the initial mount by default,
coalesces changes within one reactive publication, and announces the final committed text at most
once. `a11y:announce-initial` is an explicit opt-in.

Rapid superseding changes use latest-wins delivery. Deactivation, replacement, and disposal cancel
queued announcements. The implementation must not maintain a document-wide mutation observer or
copy every application message into a hidden global region. An explicit `LiveAnnouncer` component
may own a bounded visually hidden region for imperative application events.

### Composite navigation

```tsx
<ul
	role="listbox"
	tabIndex={0}
	aria-activedescendant={this.state.activeId}
	a11y:active-descendant={{ orientation: 'vertical', wrap: true }}
>
	{this.map(
		this.state.options,
		(option) => option.id,
		(option) => (
			<li id={option.id} role="option" aria-selected={option.id === this.state.activeId}>
				{option.label}
			</li>
		)
	)}
</ul>
```

`RovingFocus` moves one `tabIndex=0` among eligible owned items. `ActiveDescendant` keeps DOM focus
on the composite and changes the authored active ID through an ordinary callback/binding contract.
Both use logical rendered order, skip disabled or inactive items, retain keyed identity through
reorders, and fence stale candidates by renderer generation.

The first delivery supports horizontal, vertical, grid, and both-axis navigation; optional wrapping;
Home, End, PageUp, and PageDown policy; and locale-aware horizontal direction. Typeahead and
selection are separate policies because moving focus does not always select.

The package does not infer widget role or selection behavior. Authors or a higher-level component
library remain responsible for the correct role, state, label, and application action.

### Input modality and focus visibility

```tsx
<nav a11y:modality={this.state.inputModality}>...</nav>
```

A document-scoped, reference-counted modality source distinguishes keyboard, pointer, and virtual
focus intent without replacing `:focus-visible`. Consumers normally use CSS; the enhancement exists
for behavior that genuinely needs the current modality. Its listeners are installed only while a
consumer exists and are released when the final lease ends.

## Compiler diagnostics

The checker owns a versioned projection of relevant HTML and ARIA role/property data. Generated
tables must record their upstream specification version and be drift-checked; handwritten lists are
limited to eXact composition rules. TypeScript continues to own ordinary JSX property typing.

Every diagnostic has a stable code, primary source span, related reasons, and confidence class:

- `error`: the compiler can prove the authored result violates a finite framework contract;
- `warning`: the compiler can prove a likely accessibility failure but valid exceptional behavior
  exists; and
- `advisory`: an improvement that never changes build success.

The first delivery checks:

1. statically known ARIA properties incompatible with a statically known role or intrinsic;
2. invalid static ARIA token values and ID-reference shape;
3. statically duplicated IDs inside one compiler-finite rendered branch;
4. a native control with no provable accessible-name source in its finite local structure;
5. `label[for]` and statically known ARIA ID references whose target cannot exist in the same finite
   ownership region;
6. a control-like gesture on a provably non-focusable target or without keyboard policy;
7. a click-like non-native target with no keyboard activation path;
8. positive static `tabIndex`;
9. an accessibility enhancement applied to an incompatible target or unresolved `_target`;
10. conflicting focus-scope, roving-focus, active-descendant, and native-dialog ownership;
11. a required accessibility activator excluded from the selected capability catalog; and
12. motion definitions whose declared reduced behavior conflicts with a required accessibility
    policy.

The compiler must not claim that a dynamic expression is empty, that an opaque component lacks an
accessible name, that an ID generated by a child is missing, or that a runtime color combination
fails contrast. It records `dynamic-name`, `opaque-target`, or another structured explanation for
language-tool inspection without emitting a false build failure.

### Accessible-name proof

The static proof recognizes only finite local sources:

- nonempty static text inside a native naming relationship;
- a valid `label[for]` or wrapping label;
- nonempty `aria-label` or `aria-labelledby` fallback source;
- `alt` where the intrinsic's naming algorithm uses it;
- a supported native name source such as a button's finite local content; and
- a localized property marker backed by the required authored fallback described below.

It does not attempt to reproduce the browser's complete accessibility-tree algorithm. The proof is
a conservative source diagnostic, while browser-based tests remain authoritative for rendered
behavior.

## Internationalization coordination

`@exactjs/intl` currently owns localized property messages for `alt`, `title`, `placeholder`,
`aria-label`, `aria-description`, `aria-roledescription`, and `aria-valuetext`. Accessibility must
compose with that surface without creating a second writer or requiring catalogs during component
compilation.

### Property ownership

For a localized accessible property:

```tsx
<button
	aria-label={`Delete ${count} messages`}
	intl:aria-label="plural:cardinal"
	onClick={removeMessages}
>
	<TrashIcon aria-hidden="true" />
</button>
```

the ownership order is:

1. application TSX owns the executable source-locale fallback;
2. the intl analyzer owns message extraction and catalog compatibility;
3. the intl enhancement owns reactive substitution of the final property value; and
4. accessibility behavior and diagnostics consume the property but never rewrite its text.

The accessibility checker counts a supported `intl:*` property activator as a naming source only
when the corresponding authored fallback property is present. It checks the fallback's static
shape but does not inspect catalogs. The intl analyzer remains responsible for placeholder,
selector, locale, and catalog validation.

An intl target for a property required by the accessible-name proof must not resolve to an empty or
whitespace-only value. Catalog validation reports the invalid target and runtime rendering retains
the authored fallback. This rule is attached to the descriptor's semantic property role rather than
to a hard-coded message ID.

`aria-describedby`, `aria-labelledby`, `aria-controls`, `aria-owns`, and `aria-activedescendant`
remain identity relationships and are never translation messages. The accessibility or forms
package may coordinate those IDs; intl must not extract or replace them.

### Language context

Introduce a small browser-safe `LanguageContext` contract in core rather than making accessibility
depend on `@exactjs/intl`:

```ts
interface LanguageContextValue {
	readonly locale?: string;
	readonly direction: 'ltr' | 'rtl';
	readonly generation: number;
	readonly updating: boolean;
}
```

An intl provider publishes this context while applying one atomic locale generation. Applications
without intl may publish it directly; otherwise accessibility falls back to the nearest rendered
`dir` value and then document direction.

Composite horizontal navigation interprets previous/next using the resolved direction. Focus order
still follows logical rendered order unless the authored policy explicitly requests visual order.
The accessibility package never derives translation, unit, number, or collation rules from this
context.

Live regions coalesce changes until `updating` becomes false. A change caused solely by adopting a
new locale generation is not announced by default, preventing every localized status region from
speaking during a language switch. `a11y:announce-locale-change` opts one region into announcing its
final localized text. Application-triggered status changes during the same generation remain one
final announcement.

### Structural translation

Intl may reorder message fragments inside a marked region. Accessibility enhancements retain
logical component, keyed, and ID ownership rather than caching a source-order DOM path. After a
translated plan commits, a composite coordinator refreshes its finite eligible item order from the
renderer-owned range and preserves the active keyed item when it still exists.

Focus must not be moved merely because translated content reorders. If the active item disappears,
the coordinator applies its ordinary removal policy after publication.

## SSR, hydration, and activation

SSR emits authored and localized ARIA properties plus any deterministic relationship attributes,
but never serializes active DOM nodes, focus history, modality, pending announcements, or keyboard
sessions. Hydration adopts compatible IDs and relationships and creates fresh browser-owned
sessions.

Focus scopes do not focus during passive hydration. Live regions do not announce server content on
adoption. Roving and active-descendant coordinators preserve live pre-hydration focus and control
state when it remains compatible. Mismatch recovery affects only the owning range and cancels stale
restoration or announcement generations.

An interaction-lazy region may remain deferred only when its accessible native fallback is complete
before activation. A required keyboard coordinator, modal trap, or announcement behavior makes the
narrowest owning region eager unless the lazy-island proposal proves and implements a safe event
activation policy for that exact behavior.

## Language tools and DevTools

The LSP presents the same diagnostic codes as the compiler and may offer code actions only when the
edit is semantics-preserving or explicitly describes its behavioral change. Safe actions include:

- connecting an existing static label and control ID;
- replacing a positive `tabIndex` with `0` when no authored order depends on it;
- adding a missing enhancement import for an already-authored namespace; and
- expanding an enhancement into its explicit component equivalent.

It must not invent human-facing labels, roles, keyboard behavior, or live-region urgency.

DevTools projects active focus scopes, restoration targets, composite active items, modality,
announcement generations, and required enhancement ownership. It exposes localized accessible text
as already-public UI content but never catalog internals or translator metadata.

## Testing

Protection is layered according to the boundary:

- pure generated-table and diagnostic tests cover roles, properties, name sources, finite IDs,
  severity, and uncertainty fallbacks;
- compiler/LSP parity tests prove identical diagnostic codes and reasons;
- component tests cover nested focus scopes, restoration, keyed reorders, disabled items, RTL
  navigation, announcement coalescing, cancellation, and disposal;
- DOM/SSR/hydration tests cover stable IDs, localized properties, dirty controls, passive adoption,
  mismatch recovery, and lazy eligibility;
- intl integration tests switch locale while focus is inside reordered content and verify final
  accessible properties plus bounded announcement behavior;
- browser accessibility-tree tests verify representative accessible names, descriptions, roles,
  states, and relationships; and
- manual screen-reader coverage records at least one Windows and one Apple browser/screen-reader
  pairing for focus scopes, composite navigation, errors, and live regions.

Automated accessibility scanners supplement these tests but do not replace behavioral assertions.

## Delivery slices

1. **Compiler baseline:** generated ARIA data, intrinsic/role/property checks, accessible-name proof,
   gesture/focusability checks, structured reasons, and LSP parity.
2. **Focus and announcements:** required enhancement metadata, `FocusScope`, modal inertness,
   restoration, `LiveRegion`, explicit components, hydration behavior, and inspection.
3. **Composite navigation:** roving focus, active descendant, keyed identity, direction-aware
   keyboard policy, and testing helpers.
4. **Intl coordination:** neutral `LanguageContext`, localized-property nonempty contract, atomic
   announcement coalescing, translated structural reorder coverage, and cross-package tests.

Slice 1 does not require the runtime package. Slices 2 and 3 may ship before an application uses
intl, but slice 4 is required before the accessibility package is described as coordinated with the
internationalization enhancement.

## Acceptance criteria

1. Native elements and authored ARIA remain the source of semantic truth.
2. Required accessibility behavior cannot be removed silently by enhancement build policy.
3. Every runtime session has one durable owner and releases listeners, inertness, queued work, and
   restoration authority on cancellation or disposal.
4. The compiler emits no diagnostic that depends on executing application code, loading a catalog,
   or inspecting an opaque component implementation.
5. Compiler and LSP diagnostics have stable codes, source ranges, related reasons, and matching
   results.
6. Intl is the only writer of localized accessible-property text; accessibility is the only owner
   of its focus, keyboard, announcement, and relationship sessions.
7. Localized accessible names retain source fallbacks and cannot become empty through a catalog.
8. Locale changes update direction and accessible properties atomically without moving focus or
   causing unbounded announcements.
9. SSR and hydration preserve semantic attributes and IDs without serializing browser-owned focus
   or announcement state.
10. Excluding the entire package leaves no authored namespace unresolved and is permitted only when
    every reached activator has a proven native fallback or is absent.
