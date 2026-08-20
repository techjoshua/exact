# Accessibility

`@exactjs/accessibility` is eXact's native-first accessibility enhancement package and trusted
language provider. It adds only the coordination HTML does not already supply: stable ref-based
ARIA relationships, bounded focus entry/restoration, and complete keyboard policies for a finite
set of custom composites. Native elements, ordinary ARIA, browser modality, live regions, and
assistive technology remain authoritative.

## Activation

Use an attributed import in one component:

```tsx
import * as a11y from '@exactjs/accessibility/enhancements'
	with { type: 'exact-enhancement' };
```

Or export the namespace package-wide so every owned component receives the namespace and its
Node-only language checks:

```ts
// prettier-ignore
export * as a11y from '@exactjs/accessibility/enhancements' with { type: 'exact-enhancement', scope: 'package' };
```

The package-wide export behaves like a virtual import. Generated modules import the runtime only
when they use an `a11y:*` activator. A local `a11y` declaration is a duplicate identifier rather
than a shadowing override.

## Native modal dialogs

Core owns the writable modal binding because it is an intrinsic browser endpoint:

```tsx
function Settings(this: Component<{ open: boolean }>) {
	this.state.open = false;
	this.log.info(`Settings dialog ${this.state.open ? 'opened' : 'closed'}`);

	return () => (
		<>
			<button commandFor="settings" command="show-modal">
				Settings
			</button>
			<dialog id="settings" modal:isOpen={this.state.open}>
				<button commandFor="settings" command="request-close">
					Cancel
				</button>
				<button commandFor="settings" command="close">
					Save
				</button>
			</dialog>
		</>
	);
}
```

`modal:isOpen` bidirectionally binds one writable reactive boolean to the dialog's native modal
state. Changing the boolean opens or closes the dialog with `showModal()` or `close()`, while native
`toggle` and `close` completion writes the final `:modal` state back. It cannot be combined with
`open`, which is nonmodal HTML state. SSR never serializes modal state as `open`; hydration adopts a
dialog opened before hydration and then resumes normal binding.

The accessibility analyzer checks finite command targets, command/target compatibility, dialog
labelling, and custom modal substitutes. The enhancement package does not implement focus trapping,
top-layer placement, Escape handling, or background inertness.

## Ref relationships

The package covers every ARIA ID-reference property:

| Enhancement             | DOM property            | Value                           |
| ----------------------- | ----------------------- | ------------------------------- |
| `a11y:activeDescendant` | `aria-activedescendant` | one ref                         |
| `a11y:controls`         | `aria-controls`         | one ref or an ordered ref array |
| `a11y:describedBy`      | `aria-describedby`      | one ref or an ordered ref array |
| `a11y:details`          | `aria-details`          | one ref                         |
| `a11y:errorMessage`     | `aria-errormessage`     | one ref                         |
| `a11y:flowTo`           | `aria-flowto`           | one ref or an ordered ref array |
| `a11y:labelledBy`       | `aria-labelledby`       | one ref or an ordered ref array |
| `a11y:owns`             | `aria-owns`             | one ref or an ordered ref array |

```tsx
const helpKey = createRef<HTMLSpanElement>('password help');

function Password(this: Component<{}>) {
	const help = this.ref(helpKey);
	return () => (
		<label>
			Password
			<input a11y:describedBy={help} />
			<span ref={help}>Use at least twelve characters.</span>
		</label>
	);
}
```

Valid authored IDs are reused. Otherwise core assigns `exact-${crypto.randomUUID()}` once and
leaves it on the element. SSR emits stable identity for every ref-bearing intrinsic, which makes a
relationship independent of whether its target appears before or after the enhanced element and
safe for streaming. Hydration adopts that ID. Arrays preserve order and deduplicate IDs.

Scalar localized fallbacks remain authored. For example, `intl:aria-label` can coexist with
`a11y:labelledBy`; native accessible-name precedence decides which source is effective. Neither
package suppresses the other's output.

## Focus lifecycle

```tsx
<section a11y:focusScope a11y:initialFocus={firstField} a11y:returnFocus={opener}>
	<input ref={firstField} />
</section>
```

`a11y:initialFocus` and `a11y:returnFocus` require `a11y:focusScope`. Initial focus runs only after
a new browser publication, never during passive hydration. The default return target is the
connected element focused when the scope began; an explicit ref replaces it and `false` disables
restoration. Nested scopes restore in stack order and an ending scope never steals focus after the
user moved elsewhere. On `dialog`, the session follows native modal open/close but does not replace
native containment.

## Composite navigation

```tsx
<ul role="listbox" aria-label="Assignee" a11y:navigate>
	{this.map(
		this.state.people,
		(person) => person.id,
		(person) => (
			<li role="option" aria-selected={person.id === this.state.assignee}>
				{person.name}
			</li>
		)
	)}
</ul>
```

The shipped runtime accepts `tablist`, `listbox`, `radiogroup`, `toolbar`, and `grid`. Tree, menu,
menubar, and treegrid are rejected until a complete expand/submenu/tree-grid action contract is
available. `a11y:navigate` defaults to roving tab index. Options can select `activeDescendant`,
override orientation or wrapping, disable Home/End, and add a positive integer PageUp/PageDown
step. The coordinator moves focus only; application selection, checked state, and tab activation
remain ordinary state and event logic.

Each session observes only its target subtree with a bounded attribute filter and rescans before a
navigation key. It excludes nested composites, hidden/inert/disabled items, preserves later
external `tabindex` writes, retains a container tab stop while empty, and disconnects on disposal.
Logical lists do not reverse in RTL. Grid column movement reads the target's current computed
direction because that movement is spatial.

## Prefer native semantics

Use native `button`, links, labels, controls, `details`, `dialog`, `popover`, `status`, `alert`,
`log`, `progressbar`, `aria-live`, and `:focus-visible` before adding enhancement behavior. There is
no accessibility live-region scheduler, input-modality context, locale coordinator, or custom
modal implementation.

## Language tooling

The trusted Node-only provider is activated by the same local import or package-wide export. It
validates finite ARIA names and values, IDs and relationships, labels and accessible-name evidence,
native commands, positive tab order, pointer-only custom interactions, focus companion props,
dialog usage, live-region conflicts, and supported composite structure. It provides ARIA/role/
command completions, effective-name and enhancement hovers, inferred navigation hints, and a safe
positive-`tabIndex` edit. Hover ownership selects the innermost JSX element at the cursor, so a
containing layout element cannot mask a nested attribute or enhancement. Provider errors
participate in the generic build validation gate.

Dynamic text, opaque component output, and runtime-created IDs are described as unproven rather
than guessed invalid. Ignore and trust policy use the shared `languageExtensions` configuration;
the package has no separate analyzer process in browser code.

## Runtime boundaries

- Generated IDs use the platform `crypto.randomUUID()` implementation.
- `MutationObserver` is per active navigation target; there is no document-wide observer or
  renderer child-publication hook.
- Modal state uses native methods and events. Unsupported browser targets need an application
  platform policy rather than a framework modal emulation.
- Only the five complete composite policies above are advertised by the runtime and completions.
