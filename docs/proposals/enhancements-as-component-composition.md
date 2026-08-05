# Separate enhancements from framework plugins

## Status

Implemented after the implemented
[`recursive-server-client-graph-partitioning.md`](recursive-server-client-graph-partitioning.md)
contract and before
[`server-component-library-trust.md`](server-component-library-trust.md),
[`cooperative-structured-children.md`](cooperative-structured-children.md),
[`enhancement-first-internationalization.md`](enhancement-first-internationalization.md),
[`component-value-callback-bindings.md`](component-value-callback-bindings.md),
[`lazy-interaction-islands.md`](lazy-interaction-islands.md),
[`compiler-planned-structural-refresh.md`](compiler-planned-structural-refresh.md), and
[`partial-prerender-resumption.md`](partial-prerender-resumption.md). Those proposals must consume
the component groups, `_target` exports and contribution ownership, root-bearing frames, and target
generations defined here rather than preserve the former single-callable namespace or unrestricted
target search.

The terminology cutover, finite activator maps, direct `_` composition, ordinary `_target`, bounded
logical-output-frame routing, local structural invalidation, production inspection, package
classification, and portable metadata documentation are implemented and verified.

| Delivery area                              | State       | Delivered contract                                                                                                                        |
| ------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `exact-enhancement` terminology            | Implemented | Current source, compiler diagnostics, adapters, packages, and docs use enhancement terminology without a compatibility spelling.          |
| Finite activator maps                      | Implemented | Alias chains, canonical grouping, selector/payload activators, default suppression, finite spreads, distribution, and grouped validation. |
| Direct `_` composition and bounded routing | Implemented | DOM, SSR, hydration, component testing, conditional frames, Suspense, and Activity share the bounded route contract.                      |
| Ordinary `_target`                         | Implemented | Independently owned props, events, refs, cleanup, local rerouting, generations, and redaction-safe production inspection.                 |
| Component-library reclassification         | Implemented | Motion, gestures, physics, and gravity are ordinary component libraries with no classification-only framework-plugin projections.         |
| Portable trust-policy seam                 | Implemented | Package identity, component placement/reachability, and enhancement linkage are documented as policy-free compiler output.                |

This proposal combines a terminology, package-classification, and documentation correction with
three component-language changes. It generalizes compiler resolution so one finite enhancement
namespace can use exported activators to select several ordinary components and share applicable
props between them; it makes the framework `_` fragment an explicit direct-composition host for
enhancements; and it introduces the ordinary `_target` pseudo-intrinsic so any component can forward
declarative properties and a semantic intrinsic target through transparent or structural
composition. It does not redesign enhancement linking, catalog activation, or optional
availability. It replaces unrestricted descendant target discovery for other component declarations
with `_target` propagation and a bounded logical-output-frame fallback shared by DOM rendering, SSR,
and hydration.

| Area                 | Current terminology                            | Proposed terminology                                       |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Enhancement packages | Commonly grouped and documented as plugins     | Component libraries                                        |
| Attributed import    | `with { type: 'exact-plugin' }`                | `with { type: 'exact-enhancement' }`                       |
| Compiler output      | Plugin enhancement metadata                    | Enhancement metadata                                       |
| Bundle-local lookup  | Plugin enhancement catalog                     | Enhancement catalog                                        |
| JSX documentation    | Plugin-owned JSX                               | Enhancement composition                                    |
| Framework plugins    | Sometimes includes enhancement libraries       | Only host extensions using the validated plugin protocol   |
| Namespace ownership  | One imported callable owns every finite member | Exported activators may select several ordinary components |
| Root resolution      | Entire logical descendant subtree              | `_target` export, direct `_`, or first root-bearing frame  |
| Runtime behavior     | Optional catalog-selected ordinary component   | Same component model with `_` and `_target` language forms |

## Decision

Define enhancements and framework plugins as separate concepts.

An enhancement is an ordinary eXact component supplied by a component library and applied through
the compiler-supported namespaced JSX form. The compiler records enhancement metadata, the final
application build may include its implementation in the bundle-local enhancement catalog, and the
renderer activates it as an ordinary inspectable component when available. When it is unavailable,
the authored target remains unchanged.

A framework plugin is a package-level host extension discovered and prepared through
`@exactjs/plugin-host`. It may contribute validated configuration or build, server, render, client,
and testing projections with explicit trust and lifecycle boundaries.

These mechanisms are independent. Enhancement participation does not make a component library a
framework plugin, and framework-plugin installation does not make a package an enhancement
library.

Enhancements do not become a special component kind. `_target` is consequently available to every
ordinary component and has identical rendering semantics whether that component is invoked through
normal JSX or through namespaced enhancement syntax. Enhancement invocation changes only how the
ordinary component is selected and composed around authored output.

## Preserved enhancement pipeline

This proposal retains the existing enhancement declaration, metadata, catalog, optional activation,
and ordinary-component lifecycle pipeline while extending namespace selection, adding direct `_`
composition and ordinary `_target` forwarding, and bounding fallback target search as described
below:

```tsx
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };
import { fade } from '@exactjs/motion/presets';

<ProductCard motion:apply={fade} />;
```

The source spelling changes from `exact-plugin` to `exact-enhancement`, but the attributed import
continues to establish a local JSX namespace for optional ordinary component enhancements. For the
existing default-only form, the compiler continues to:

- resolve the imported callable's finite public prop shape;
- type-check namespaced members and map kebab-case names to component props;
- reserve `children`, `key`, `ref`, and the language-owned `namespace:root` selector;
- group reactive enhancement props into one compiler-owned marker;
- erase the compile-only import from ordinary application execution;
- emit canonical module/export identity and renderer enhancement metadata; and
- preserve enhancement components in placement and ownership planning.

Build adapters continue to link compiler-emitted module fragments into an application-bundle-local
enhancement catalog. DOM, SSR, hydration, and component testing continue to receive that catalog
through the existing renderer options or generated facades.

Activation remains optional at runtime:

- an available catalog entry mounts the enhancement as an ordinary component at the resolved
  intrinsic target;
- an available entry authored on the framework `_` fragment occupies that fragment's composition
  boundary directly instead of resolving an intrinsic target;
- an unavailable entry leaves the authored target unchanged and follows the existing diagnostic
  policy;
- SSR resolves the same logical target through components, lists, dynamic output, and the selected
  Suspense candidate;
- hydration adopts authored DOM before activating available client enhancements;
- ordinary `_target` boundaries contribute to and propagate semantic intrinsic targets;
- `namespace:root` routes within the bounded target/root-bearing output frame defined below; and
- co-targeted enhancements continue to use ordinary context effects for pre-setup ordering.

No part of that pipeline becomes required component composition, normal eager module execution, or
plugin-host discovery as a result of this proposal.

## Finite activator-to-component export maps

Allow an enhancement capability module to identify component-selecting members, called
**activators**, through attributed re-exports. Activators select the ordinary components used at one
JSX boundary. Other namespaced props are distributed to every selected component whose finite
public prop contract declares them.

This supports optional coordinating components, several implementations behind one authoring
namespace, and shared configuration without forcing a component to select fundamentally different
setup behavior from reactive prop values or requiring libraries to re-export every supported prop.

For example, a conceptual motion library can expose separate fade and slide-up components:

```ts
export {
	FadeMotion as fade,
	SlideUpMotion as slideUp
} from './dist/components.js' with { type: 'exact-enhancement' };
```

An attributed namespace import establishes the local JSX prefix:

```tsx
import * as motion from '@exactjs/motion/enhancements'
	with { type: 'exact-enhancement' };

<section
	motion:fade
	motion:slide-up={{ distance: 24 }}
	motion:duration={180}
/>
```

If both components declare `duration`, the compiler emits two enhancement entries and includes
`duration` in both prop groups:

```ts
// Conceptual metadata; the exact IR representation remains internal.
[
	{
		identity: '<canonical FadeMotion identity>',
		props: { duration: 180 }
	},
	{
		identity: '<canonical SlideUpMotion identity>',
		props: { slideUp: { distance: 24 }, duration: 180 }
	}
];
```

Activator presence always selects its mapped component, independently of the activator's value. An
activator is forwarded as an ordinary prop only when the selected component explicitly declares a
matching camel-case prop. JSX uses the corresponding kebab-case spelling. This permits both
selector-only and payload-bearing activators without hidden mode metadata:

```ts
interface FadeMotionProps {
	readonly duration?: number;
	readonly easing?: Easing;
}

interface SlideUpMotionProps {
	readonly slideUp: true | SlideUpOptions;
	readonly duration?: number;
	readonly distance?: number;
}
```

Here `motion:fade` is selector-only because `FadeMotionProps` does not declare `fade`; it selects
`FadeMotion` but is omitted from that component's props. `motion:slide-up` is payload-bearing because
`SlideUpMotionProps` declares `slideUp`; its authored value is checked and forwarded. A valueless
payload-bearing activator supplies `true`, which must be accepted by the declared prop type.

The compiler uses activators to choose component owners, then uses those components' complete prop
contracts to distribute the remaining members. An ordinary prop accepted by one selected component
is sent only to that component. A shared prop such as `duration` is sent to every selected component
that accepts it. A member accepted by none of the selected components is a diagnostic.

The motivating gravity scope uses the same mechanism without making one component implement both
roles:

```ts
export {
	GravityField as scope,
	GravityElement as body
} from './dist/components.js' with { type: 'exact-enhancement' };
```

```tsx
<section gravity:scope gravity:field={earth} gravity:size={bounds}>
	<div physics:body={moon} gravity:body gravity:scale={0.5} />
	<div physics:body={satellite} gravity:body />
</section>
```

`scope` selects `GravityField` without becoming a prop; its contract receives `field` and `size`.
Each selector-only `body` activates a `GravityElement`, which receives `scale` where authored and
consumes the actual body from same-target `PhysicsBodyContext`. `GravityField` can publish a
coordinator context that the descendant `GravityElement` instances consume through ordinary
component context and lifecycle semantics.

### Canonical grouping

Several activators may intentionally resolve to the same underlying component:

```ts
export {
	TransitionMotion as fade,
	TransitionMotion as slideUp
} from './dist/components.js' with { type: 'exact-enhancement' };
```

In that case the compiler groups by canonical component identity after resolving aliases and
re-export chains. Using both activators produces one setup-once `TransitionMotion` instance:

```ts
{
	identity: '<canonical TransitionMotion identity>',
	props: {
		fade: true,
		slideUp: { distance: 24 },
		duration: 180
	}
}
```

Because `TransitionMotion` publicly declares both activator props, it receives both and can
distinguish how it was selected. It may support them together, or it may use a discriminated union
that permits only one. The compiler must validate the complete grouped prop object against the
selected component contract after distribution; checking each property in isolation is
insufficient. Consequently, mutually exclusive activators fail against a component union instead
of producing an invalid instance.

When several activators resolve to one component but that component declares none of their matching
props, the activators are equivalent selector-only routes and the component receives no hidden
record of which routes selected it. A component that needs that distinction opts in by declaring the
corresponding activator props. Distinct setup and ownership should use distinct component identities.

If activators resolve to different components, the compiler emits one co-targeted entry per
canonical component and applies the existing context-derived and canonical ordering rules. The
namespace is an authoring group, not runtime identity.

### Default compatibility

This is an additive generalization of the existing callable form. A default-only enhancement
capability continues to select its one component implicitly, maps all finite public props to that
component, and retains the current default-import authoring form.

A capability may expose a default component together with named activators. The default is selected
only when no named activator is present at that boundary. Named activators suppress implicit default
selection so a shared option does not unexpectedly instantiate the default component as well:

```tsx
<div motion:duration={180} />;
// No activator: use the default component.

<div motion:fade motion:duration={180} />;
// Select FadeMotion only; do not also select the default component.
```

A mapped namespace without a default component requires at least one activator. An option such as
`motion:duration` cannot select a component by itself in that form.

### Compile-time rules

The compiler and language tools must enforce the following rules:

1. Only re-exports carrying `type: 'exact-enhancement'` define activators. Ordinary package exports
   remain ordinary imports and APIs.
2. Every activator resolves to an eXact component with a finite public prop contract.
3. Activator presence selects the component structurally. `false`, `undefined`, or another runtime
   value does not suppress selection; conditional selection requires conditional authored
   structure with statically understood activator key presence.
4. If the component declares a prop matching the activator's camel-case export alias, the activator
   is payload-bearing: its value is checked and forwarded under that prop name. A valueless JSX
   activator supplies `true`, which must satisfy the declared prop type.
5. If the component does not declare a matching prop, the activator is selector-only: it must be
   valueless and is erased after component selection rather than entering the grouped props.
6. One authored activator name maps to exactly one component. Duplicate or ambiguous mappings are
   package diagnostics.
7. `children`, `key`, `ref`, and the language-owned `root` selector cannot be activators or
   distributable enhancement props.
8. Re-export aliases and chains resolving to the same underlying component share one canonical
   component identity. The alias itself never becomes instance identity.
9. Components are selected and deduplicated before ordinary props are distributed. Every ordinary
   prop is copied to all selected components that declare it.
10. If recipients declare different types for a shared prop, the authored value must satisfy every
    recipient. Diagnostics identify the incompatible components and contracts.
11. After distribution, each complete grouped prop object must satisfy its component's public
    contract, including unions, mutual exclusion, and required props.
12. `namespace:root` applies to every selected component group produced by that namespace
    declaration at the boundary. Group-specific routing requires a separate future design.
13. Open dictionaries remain invalid. Finite spreads are accepted only when activator key presence
    and all possible namespaced members are statically known; their values join the same selection,
    distribution, and grouped-contract validation.
14. After
    [`component-value-callback-bindings.md`](component-value-callback-bindings.md), a namespaced
    attribute that resolves both as an enhancement member and as a finite component value/callback
    pair is an ambiguity diagnostic. Kebab-case and camelCase completion reduce collisions but never
    establish silent precedence.

Completions are contextual. Before selection, language tools offer activators and, when present,
default-component props. After one or more activators are authored, they offer the union of the
selected components' public prop names. Hover and diagnostics for a shared prop identify every
component that will receive it. Activator completion and hover distinguish selector-only activators
from payload-bearing activators and show a value type only for the latter.

### Compiler ownership

This feature belongs primarily to enhancement import/export resolution, type analysis, JSX
lowering, placement planning, and language tooling. Runtime packages should not receive a new
dispatcher, namespace object, registration API, or component-family abstraction.

The native compiler should extend its current enhancement binding table from one binding identity
per namespace to a finite activator map plus an optional default component. JSX analysis selects
components from present activators, deduplicates them by canonical identity, distributes remaining
props from their finite contracts, validates the complete groups, and passes those groups to the
existing lowering path.

Existing lowering already groups enhancement props and can emit multiple entries at a JSX boundary.
Placement planning treats each resulting component exactly like an enhancement component imported
through its own prefix today. Context provision and consumption remain attached to the actual
component, which lets a scope component publish a coordinator context while body components consume
it without either implementation branching between roles.

Build adapters continue to consume the resulting renderer enhancement metadata. They may see more
than one component identity originating from a source namespace, but require no new runtime catalog
shape or activation protocol.

## Ordinary `_target` forwarding

Introduce `_target` as a compiler-recognized lowercase pseudo-intrinsic in the ordinary component
language. Like `_`, it emits no DOM element and requires no imported implementation. Unlike `_`, it
establishes a semantic intrinsic target within its children and contributes its authored properties
to that target:

```tsx
function Surface(props: SurfaceProps) {
	return () => <_target className={surfaceClasses(props)}>{props.children}</_target>;
}
```

Normal component composition uses that behavior directly:

```tsx
<Surface tone="panel">
	<article className="card">Content</article>
</Surface>
```

Conceptually produces one intrinsic element with combined contributions:

```html
<article class="card surface-panel">Content</article>
```

The same `Surface` implementation may be selected through namespaced enhancement syntax. Its setup,
output, `_target` behavior, ownership, reactivity, and cleanup do not change; only invocation and
optional catalog activation differ:

```tsx
<article className="card" surface:tone="panel">
	Content
</article>
```

### Structural wrappers and target propagation

An ordinary component may emit wrapping structure outside `_target`. The wrapper remains ordinary
output, while `_target` identifies and augments the semantic intrinsic produced by its children:

```tsx
function Field(props: FieldProps) {
	return () => (
		<label className="field">
			<span>{props.label}</span>
			<_target aria-describedby={props.descriptionId}>{props.children}</_target>
			<small id={props.descriptionId}>{props.description}</small>
		</label>
	);
}
```

Given an input child, `aria-describedby` belongs to the input rather than the wrapping label. This
works whether `Field` is invoked explicitly or selected as an enhancement.

Target identity propagates through ordinary component invocations. When a component's active output
contains `_target`, the first active `_target` in logical order establishes that invocation's
exported semantic target even when the component also emits earlier wrapping intrinsics. An outer
`_target` or enhancement declaration follows the nested component's exported target instead of
mistaking its wrapper markup for the intended target. Additional `_target` boundaries remain valid
local contribution boundaries for their own child output; they do not make the component invalid.

Within one `_target`, target resolution examines its current child output. A direct intrinsic is
authoritative. A nested component's exported `_target` result propagates through that invocation.
Otherwise the bounded first-root traversal described below supplies the fallback. Fragments,
projected children, selected conditions, lists, Suspense, and Activity participate through their
ordinary logical-output semantics.

The only unconditional `_target` authoring error is omitting children:

```tsx
<_target className="surface-panel" />
// Error: _target requires children.
```

Children are not required to produce an intrinsic in every render. When the selected output is text,
empty, or temporarily lacks an intrinsic, the boundary remains transparent and its contributions
remain dormant. If a later structural update produces a target, the same owned contributions attach
to it; replacement releases the old attachment before adopting the new target generation.

### Layered property composition

`_target` properties are independently owned layers, not a cloned or destructively overwritten
child-prop object. Resolution proceeds from outer contributions toward the intrinsic, with the
nearest contribution winning for singular values and properties authored directly on the intrinsic
winning last. Context-derived and canonical enhancement-chain ordering supplies the existing
deterministic nesting order for co-targeted enhancements.

Property categories compose as follows:

| Property category                                                                                                    | Composition rule                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Singular values such as `id`, `title`, `role`, `tabIndex`, `href`, `name`, and `value`                               | Nearest defined owner wins; the intrinsic's authored value has highest precedence                                               |
| `className` and `className:*`                                                                                        | Add opaque class tokens from every owner and remove duplicate tokens without interpreting CSS-framework meaning                 |
| `style`                                                                                                              | Merge per CSS property; the nearest defined property wins while unrelated properties remain                                     |
| Standards-defined token lists such as `aria-describedby`, `aria-labelledby`, `aria-controls`, `aria-owns`, and `rel` | Combine and deduplicate tokens, ordered from the intrinsic outward                                                              |
| `ref`                                                                                                                | Fan out the same intrinsic target to every independently owned ref and release each ref with its owner                          |
| Event handlers                                                                                                       | Compose as independently owned same-element subscriptions, ordered from the intrinsic outward through nearest-to-outer wrappers |

For singular values and individual style properties, `undefined` means that an owner makes no
contribution and exposes the next layer. `null` is an explicit omission that shadows lower-priority
layers. Boolean values retain the intrinsic property's normal boolean semantics while participating
in the same precedence rules. Reactive changes recompute only the affected token, property,
attribute, ref, or subscription; removing an owner reveals the next applicable layer.

Known token-list behavior comes from the platform property contract. The renderer must not infer a
token list merely because a string contains spaces. In particular, class tokens remain opaque: core
rendering does not attempt to decide whether two Tailwind utilities or other framework classes are
semantically contradictory. A styling adapter may validate classes it generates, while authored
class conflicts remain subject to the ordinary CSS cascade.

Event composition must preserve normal eXact event typing, task/interaction ownership, cancellation,
error routing, and cleanup for each contributing component. Same-element ordering is deterministic;
`stopImmediatePropagation()` prevents later same-element contributions in that dispatch just as it
does for ordinary listeners. `_target` does not turn event handlers into one anonymous combined
callback.

Ordinary duplicate-attribute diagnostics continue to apply within one JSX opening element. A value
shadowed by a nearer component is not by itself an error because wrapper defaults are legitimate.
DevTools should instead expose every contribution owner, its live value, and which singular value or
style property is currently effective.

### Existing component capabilities

Because `_target` exports the component invocation's semantic intrinsic, existing root refs should
observe that exported target before falling back to the component's first intrinsic output. A
component may therefore add wrapper markup without redirecting `this.refs.root()` away from the
child it deliberately marked:

```tsx
function MotionElement(this: Component<{}>, props: MotionProps) {
	const target = this.refs.root<Element>();

	watch(() => {
		if (target.current) observeMotion(target.current, props);
	});

	return () => <_target>{props.children}</_target>;
}
```

An explicit `ref` contribution on `_target` remains useful when a component needs a named binding
in addition to its root view. Ref fan-out lets the intrinsic retain its authored ref while every
wrapper observes the same target. Motion, gestures, view transitions, instrumentation,
accessibility, and styling enhancements can consequently use ordinary refs and declarative target
properties instead of an enhancement-only target API or imperative DOM attribute mutation.

### Rendering and ownership

The compiler lowers `_target` as ordinary component-output metadata, not enhancement metadata. DOM,
SSR, hydration, component testing, and DevTools consume the same target-export and contribution
contract. No child VNode is exposed for userland cloning or mutation, and a component does not gain
a special API merely because attributed syntax may invoke it.

The renderer retains contribution ownership by component instance and target generation. Target
replacement, conditional disappearance, enhancement unavailability, deactivation, and unmount
remove only the departing owner's contributions. SSR resolves every active layer before serializing
the intrinsic element. Hydration reconstructs the same layers over adopted DOM and avoids rewriting
already equivalent attributes, styles, classes, or token lists.

This proposal introduces only the general forwarding primitive. It does not define an eXact theme,
CSS token vocabulary, Tailwind adapter, or other styling engine. Those may use `_target` in a later
proposal without changing the ordinary component contract established here.

## Direct fragment composition and bounded target resolution

Replace the current unrestricted logical-subtree target walk with explicit `_target` propagation
followed by a bounded fallback search based on component invocation output frames. The framework `_`
fragment is an explicit composition host and bypasses declaration-level intrinsic search as
described below.

A **logical output frame** is the ordered output presented by one component invocation after
framework-transparent structural ranges are resolved. A frame may directly present intrinsic
elements, `_target` boundaries, text, empty ranges, projected `props.children`, or nested component
invocations. Projected children participate in the receiving invocation's output frame for target
resolution without transferring their component, state, task, resource, or lifecycle ownership.

An active `_target` establishes an explicit semantic target result for its containing invocation as
defined above. When no such result is available, the **root-bearing frame** is the first logical
output frame reached along the first-root traversal that directly presents an intrinsic element.
That frame owns fallback and `namespace:root` discovery for the declaration.

### Direct intrinsic declarations

An enhancement authored directly on an intrinsic element targets that element immediately:

```tsx
<section motion:fade>...</section>
```

The section is authoritative. The renderer does not search its descendants for an alternate
`motion:root`, and a descendant declaration cannot reroute the enhancement away from the intrinsic
on which it was authored. Compiler validation, component grouping, catalog availability, and
co-targeted ordering still apply; only target discovery terminates.

### Underscore-fragment declarations

The framework `_` component is an explicit enhancement composition boundary:

```tsx
import { _ } from '@exactjs/jsx';

<_ motion:fade>Content</_>;
```

When the enhancement is available, its ordinary component occupies the `_` boundary and receives
the fragment's authored children. Conceptually, an active declaration is the following composition:

```tsx
<FadeMotion>Content</FadeMotion>
```

It is not a component targeting an inner `_` range and is not an enhancement wrapper around a
separately mounted fragment instance. The active enhancement component becomes the fragment at that
logical position and owns whatever output it produces, including text, one intrinsic element, or a
multi-node range. When the enhancement is unavailable, `_` retains its ordinary transparent
fragment behavior and presents the authored children unchanged.

No first-intrinsic search or `namespace:root` routing occurs for a declaration authored directly on
`_`. This allows optional components whose output is inherently inline or structural, rather than
element-targeted:

```tsx
<_ intl:plural={count}>{count === 1 ? 'One item' : `${count} items`}</_>
```

The active ordinary component may itself render `_target`, exactly as it could under explicit
component invocation. That local boundary resolves and contributes within its own children; it does
not retroactively turn the authored `_` declaration into an intrinsic-target declaration. Text-only
or multi-node structural output remains valid when the component does not require a current target.

Several active enhancements on the same `_` boundary form the same deterministically ordered
ordinary-component chain used for co-targeted enhancements. That chain collectively occupies the
fragment boundary; the transparent `_` behavior is the unavailable fallback, not an additional
inner component. Context-derived ordering, ownership, inspection, placement, cleanup, and
generation fencing remain attached to the actual enhancement instances.

An authored `key` remains framework identity for the fragment boundary. It is not forwarded as an
ordinary enhancement prop and does not become a capability-specific identity such as a translation
catalog key. DOM rendering, SSR, and hydration must preserve that boundary identity whether the
bundle activates the enhancement chain or uses the transparent fallback.

### Component declarations

For an enhancement authored on a component, first consume the component invocation's exported
`_target` result when present. Wrapping intrinsics outside that boundary remain ordinary component
output and do not steal the target. The resolved intrinsic is the declaration's fallback target;
`namespace:root` discovery remains bounded to the frame that presents that exported target rather
than reopening an unrestricted descendant search.

When the invocation has no active `_target` result, search its logical output in order:

1. Skip text and empty output that cannot provide an intrinsic target.
2. Traverse fragments, selected dynamic branches, keyed/list ranges, and other
   framework-transparent structure in logical order.
3. When a nested component is encountered before an intrinsic, recurse into that component's
   logical output frame.
4. If the nested frame and its first-root descendants produce no intrinsic, return and continue the
   containing frame.
5. When a frame directly presents the first intrinsic, make that frame the root-bearing frame and
   record the intrinsic as the fallback target.
6. Finish scanning that root-bearing frame for the first active matching `namespace:root`, traversing
   its intrinsic and framework-transparent structure but treating every nested component invocation
   as opaque.
7. Do not return to a containing frame after a nested frame successfully provides the first
   intrinsic. The selected frame exclusively owns alternate-root discovery.

When no `_target` result is exported, the fallback search is:

```text
enhanced component
└── follow first-root component/range path
    └── first frame directly presenting an intrinsic
        ├── first intrinsic is fallback
        ├── finish this frame for namespace:root
        └── do not enter nested component frames
```

This cutoff means a component later in a containing frame cannot override a root supplied by an
earlier component:

```tsx
function Outer() {
	return () => (
		<>
			<Child />
			<button motion:root>Outer action</button>
		</>
	);
}

function Child() {
	return () => <section>Child content</section>;
}

<Outer motion:fade />;
```

`Child` supplies the first intrinsic, so its output frame is root-bearing. The later button in
`Outer` is outside the search domain. If `Child` produces no intrinsic, traversal returns to
`Outer`, and the button may become the fallback or explicit target.

### Pass-through components and projected children

A component returning `props.children` still has a logical output frame:

```tsx
function PassThrough(props: { readonly children?: unknown }) {
	return () => props.children;
}

<PassThrough motion:fade>
	<section />
	<button motion:root>Open</button>
</PassThrough>;
```

The projected section and button are direct entries in the `PassThrough` frame for target
resolution. The section is the fallback and the button may override it. If the first projected entry
is a component that produces an intrinsic, that nested component's frame becomes root-bearing and
later projected siblings are outside the route search. Projection affects search containment only;
the caller retains ordinary ownership of the projected VNodes.

### Conditional and dynamic output

Root resolution examines only currently selected logical output. It must not materialize inactive
conditional branches merely to search for a possible target.

```tsx
function Shell(this: Component<{ expanded: boolean }>) {
	return () => (
		<>
			{this.state.expanded && <Panel />}
			<main>Fallback</main>
		</>
	);
}
```

When expanded, `Panel` supplies the first intrinsic and its successful root-bearing frame prevents
the search from returning to `Shell`'s later main element. When collapsed, the empty conditional
range supplies no target, traversal continues, and `Shell` becomes root-bearing at `<main>`.

A structural change affecting the first-root path or the selected frame invalidates the cached
route. If target identity changes, the renderer releases the old enhancement instance with
`enhancement-target-rerouted`, preserves normal authored DOM/component lifecycle, mounts the new
enhancement instance, and fences stale work by the previous target generation. If all active output
contains no intrinsic, the declaration remains dormant until a target appears.

The same invalidation rule applies when an active `_target` appears, disappears, changes its selected
child branch, or propagates a different nested target. Contributions detach from the old target
generation before the component invocation exports the replacement.

A conditional `namespace:root` inside the current root-bearing frame reroutes between that explicit
target and the frame's first-intrinsic fallback. Conditional selectors inside nested component
frames remain invisible to the ancestor declaration.

`Activity` parking retains root identity and the enhancement instance while deactivating owned work;
loss of presentation alone does not cause the search to fall through to a later sibling. Suspense
searches only the candidate selected by the current render mode. Candidate replacement or reveal
reroutes only when it changes the first-root path, root-bearing frame, or selected intrinsic.

### Renderer and SSR ownership

DOM rendering should cache each component invocation's active `_target` export when present,
first-root fallback result, root-bearing frame, selected intrinsic, generation, and relevant
structural dependencies. A declaration depends only on:

- active `_target` boundaries and their child target paths;
- component/range output along its first-root path;
- intrinsic and framework-transparent structure in the root-bearing frame;
- active `namespace:root` selectors in that frame;
- the selected Suspense candidate; and
- target identity, generation, and presentation state.

Changes inside opaque nested component frames cannot invalidate an ancestor route unless that
component lies on the unresolved first-root path or exports the active `_target` result being
propagated to the ancestor. Nested enhancement declarations are resolved independently and still
merge or order normally when they ultimately target the same intrinsic.

An enhancement authored directly on `_` does not create or consume a cached first-root route. Its
fragment-boundary generation instead fences structural replacement, asynchronous work, and cleanup
for the active component chain. Changes within the chain's output use ordinary component and range
semantics rather than enhancement-target rerouting.

SSR must implement the same `_target` propagation and frame cutoff. It materializes the active
target path or first-root fallback path and the chosen frame's direct logical output, but does not
set up unrelated descendant components solely for target discovery. Prepared setup-once instances
are reused by final rendering. Hydration adopts the server-selected target and validates the same
target/frame contract before activating client catalog entries; disagreement uses normal hydration
diagnostics and recovery.

For `_` declarations, SSR emits the active enhancement component's ordinary output when the server
catalog includes it and otherwise emits the transparent authored children. Hydration adopts that
logical range and applies the client bundle's matching catalog decision through the existing
catalog-agreement and recovery rules; it does not invent an intrinsic target for the declaration.

This changes target-search semantics and invalidation scope, but not enhancement entry shape,
canonical component identity, catalog lookup, optional unavailability, component ordering, or
ordinary enhancement lifecycle after a target has been selected.

## Enhancements are component-library features

Motion, gesture recognition, physics, gravity, and similar features are component-library
capabilities. Their enhancement implementations are regular setup-once eXact components with
ordinary props, contexts, tasks, resources, placement, error handling, inspection, and cleanup.

The attributed form changes how those components are attached, not what they are. It lets a library
declare optional same-target behavior without placing the wrapper in its required authored design
or deciding whether the final application bundles the implementation.

An enhancement library may also expose explicit component APIs when behavior is required or direct
composition is clearer. Both forms should use the same underlying component contracts rather than
separate plugin implementations.

Repository organization, package README structure, local agent guidance, examples, and public docs
should classify these packages with component libraries. “Enhancement library” is useful when
describing the attributed capability, but it is not a new package protocol.

## Framework-plugin boundary

Reserve “plugin” for packages that participate in the validated framework-plugin protocol:

- package discovery and trust policy;
- protocol and host-capability negotiation;
- dependency ordering and canonical implementation selection;
- typed `exact.config.ts` augmentation and validation;
- build, server, render, client, or testing projections;
- application/request resource acquisition and disposal; or
- final output processing and validation.

Compiler enhancement metadata and the bundle-local enhancement catalog are not plugin registries.
They do not discover installed packages, execute configuration controllers, establish trust,
select plugin versions, or run plugin lifecycle hooks.

A component library may independently offer a real framework-plugin surface when it genuinely needs
host participation. That dual role must be explicit:

- enhancement imports activate only the enhancement mechanism;
- plugin discovery activates only declared host projections;
- documentation presents the component library and optional host integration separately;
- enhancement code does not depend on plugin APIs merely to be cataloged; and
- removing an unnecessary plugin projection must not change enhancement compilation or optional
  runtime behavior.

For example, a motion library can remain an enhancement/component library while an independently
justified host integration installs an application-wide driver. The driver integration may be a
plugin; `motion:apply` is not.

## Server-execution trust boundary

Component libraries execute application code, and an eXact component may participate in client,
server, or distributed placement. Reclassifying enhancement packages must therefore not imply that
they are harmless data or that only framework plugins require a trust decision. Optional activation
reduces required coupling; it does not reduce the authority of an activated component.

The follow-on
[`server-component-library-trust.md`](server-component-library-trust.md) proposal defines the
boundary for enhancements and explicitly composed components together. Participating packages use
an inert `@exactjs/component-library` dependency marker, while shared bundler infrastructure applies
a plugin-like trust policy to resolved component code entering server-executing artifacts. Client-only
component code requires no additional eXact authorization.

The compiler remains completely unaware of this policy. It emits the same portable component,
placement, and enhancement metadata regardless of trust. Vite/Rollup, Webpack, Bun, and test-build
adapters use one shared authorization engine over their actual resolved graphs, enforce it before
server module evaluation, and rerun it during HMR. Enhancement exclusion retains optional inactive
behavior when policy permits; required unauthorized server components fail the build.

This separation keeps component-library authorization independent from framework-plugin discovery.
It also avoids pretending that an enhancement-only allowlist secures ordinary explicit components.
Lockfile integrity, dependency review, server placement rules, context authorization, operation
allowlisting, serialization validation, and secret residency remain necessary.

## Naming changes

Apply the distinction consistently across public and internal surfaces:

- replace the attributed import value `exact-plugin` with `exact-enhancement`;
- rename diagnostics and language-tool descriptions from plugin imports to enhancement imports;
- replace “plugin-owned JSX” with “enhancement composition” or “namespaced enhancements”;
- replace “plugin enhancement catalog” with “enhancement catalog”;
- remove plugin terminology from compiler IR, inspection output, renderer events, comments, tests,
  and generated helper names where it refers only to enhancements;
- move enhancement/component-library docs out of plugin navigation and routes; and
- rename samples such as `plugin-playground` when their purpose is demonstrating enhancements
  rather than framework-plugin lifecycle.

Existing accurate names such as `ExactRendererEnhancementIR`, `EnhancementMarker`,
`enhancementCatalog`, and enhancement planning/routing modules should remain. Internal renames
should be limited to places where plugin terminology creates the false coupling.

The source spelling migration is mechanical. Because eXact is pre-stable, remove `exact-plugin`
rather than preserving it as an alias or adding migration-specific compiler behavior. General
unknown-attribute-value diagnostics may offer an ordinary nearest-name suggestion, but the compiler
must not recognize, special-case, or otherwise mitigate the previous spelling.

## Package classification audit

Audit `@exactjs/motion`, `@exactjs/gestures`, `@exactjs/physics`, and `@exactjs/gravity` as component
libraries.

For each package:

1. Keep all enhancement exports, compiler metadata, catalog linking, and optional activation
   behavior unchanged.
2. Present explicit components and attributed enhancement usage as component-library APIs.
3. Identify whether each plugin manifest entry and config/render/client/testing projection performs
   genuine host work independent of enhancement activation.
4. Remove empty or classification-only plugin projections; retain justified projections as a
   separately documented optional plugin surface.
5. Remove `@exactjs/plugin-api` dependencies from enhancement implementation code when they exist
   only because the package was categorized as a plugin.
6. Move repository directories only when doing so improves ownership without disturbing published
   package names.

This audit is not authorization to replace global configuration or lifecycle behavior with a new
component API. Any such behavior change requires its own design decision. The distinction here is
that enhancement mechanics never require plugin participation.

## Performance and allocation constraints

This design must remain compatible with the ranked work in
[`javascript-performance-improvements.md`](javascript-performance-improvements.md). In particular:

- an unavailable enhancement adds compile-time/catalog metadata but no component instance, effect
  scope, wrapper mount, target contribution table, or reactive watcher at runtime;
- an active enhancement uses the same lazily materialized component and task ownership as an
  explicitly composed ordinary component;
- direct `_` composition must not retain both a transparent fallback mounted tree and an active
  enhancement tree after the active generation commits, except while Suspense, Activity, or a
  transition explicitly owns both;
- `_target` routing and layered contributions should reference the committed target and owner
  generation rather than clone target VNodes, child arrays, or property objects;
- multiple activators selecting one canonical component must share one instance and one ownership
  record, as required by the semantic contract, rather than merely deduplicate visible output;
- intrinsic declarations should terminate routing without allocating a descendant-search frame;
  component fallback search should allocate only along the selected logical output path; and
- SSR enhancement-planning maps, prepared children, and contribution state should be created lazily
  and released after the selected output is consumed.

Selector watches and component output generations must identify the affected enhancement boundary
directly. Ordinary text, prop, style, and unrelated child patches must not schedule a whole-root
enhancement reconciliation pass. The active `_target` or first root-bearing frame should be cached
by structural generation so non-structural updates do not rediscover the component root. Compiler
render, hydration, structural-refresh, and SSR plans should encode the same bounded frame and target
identity rather than rerun target discovery independently.

Verification must compare retained heap and mount/update/SSR time for unavailable, direct intrinsic,
direct `_`, `_target`, multi-activator, conditional reroute, Activity, and SSR-heavy enhancement
populations. Include ordinary unrelated updates inside a large enhanced tree and assert that no
global routing traversal occurs. The proposal does not set engine-specific byte contracts, but an
unavailable declaration must be indistinguishable from its ordinary fallback in runtime ownership
count after catalog selection.

## Non-goals

- Changing enhancement marker shape, canonical identities, prop reactivity, component ordering,
  optional activation, or unavailable-capability behavior after target resolution.
- Searching alternate roots inside nested component frames after a root-bearing frame has been
  selected, except for consuming a nested invocation's explicit `_target` export, or allowing a
  descendant to reroute an enhancement authored directly on an intrinsic.
- Adding runtime enhancement-family dispatch, component selection based on reactive values, or
  hidden invocation discriminators.
- Replacing the bundle-local enhancement catalog with direct eager imports.
- Making attributed enhancements required whenever their declaration is reached.
- Removing explicit component APIs from enhancement libraries.
- Removing the framework-plugin protocol or reclassifying genuine host extensions such as secrets
  and microfrontends.
- Introducing a second enhancement registration protocol, manifest, runtime component type, or
  author-facing loader table.
- Treating enhancement libraries as React higher-order components or adopting rerender semantics.
- Defining an eXact-owned theme, CSS token vocabulary, utility framework, Tailwind integration, or
  portable-theme conformance policy; `_target` only enables later libraries to contribute styling.

## Documentation changes

Split the current combined presentation into two authorities:

- `component-language.md` owns `_target` syntax and composition, enhancement syntax, compiler
  metadata, catalog activation, routing, component ownership, SSR, hydration, and limitations; and
- `framework-plugins.md` owns discovery, trust, configuration, projections, lifecycle, and output
  validation, with at most a short cross-reference explaining that enhancements are separate.

The public docs application should place motion, gestures, physics, and gravity under component
libraries or enhancements rather than plugins. Route metadata, navigation, search terms, examples,
and descriptions must stop implying that attributed JSX uses the framework-plugin host.

Package READMEs and package-local `AGENTS.md` files should call the exported implementations
components and explain both explicit and optional attributed use. The reusable eXact skill should
distinguish build-tool plugins, framework plugins, and enhancement component libraries.

## Delivery order

1. Establish the terminology and package-classification rules in engineering documentation.
2. Add `exact-enhancement` support to the compiler and TypeScript language tooling with unchanged
   lowering and metadata.
3. Extend attributed export resolution, namespace imports, completion, and JSX lowering with finite
   activator maps, canonical component grouping, shared-prop distribution, and complete grouped
   contract validation.
4. Add `_target` to ordinary JSX, implement target propagation and independently owned layered
   property contributions across DOM, SSR, hydration, tests, and DevTools, and expose its types and
   diagnostics through both compiler implementations and language tooling.
5. Make `_` a direct enhancement composition host, introduce the shared logical-output-frame
   contract for other component declarations, and replace DOM and SSR unrestricted subtree routing
   with `_target` propagation, first-root fallback traversal, root-bearing-frame cutoff, and local
   route invalidation.
6. Migrate source fixtures, applications, package declarations, tests, and generated examples from
   `exact-plugin` to `exact-enhancement`.
7. Rename internal and public descriptions that conflate the enhancement catalog with the plugin
   registry.
8. Reorganize current references and docs-app routes/navigation.
9. Audit enhancement-library plugin projections and separate or remove only those that lack genuine
   host responsibilities.
10. Publish the portable package, component, placement, and enhancement metadata seam consumed by
    the subsequent bundler-enforced server component-library trust proposal, without interpreting
    its marker or policy in the compiler.
11. Rename repository directories and samples where their current placement communicates the wrong
    ownership.
12. Remove the old attributed import spelling and run package-content and documentation consistency
    checks.

## Verification

- Compiler tests prove `exact-enhancement` produces the same diagnostics, grouped markers,
  identities, analysis metadata, and placement plans as the current enhancement form.
- Compiler tests prove several activators resolving to one canonical component produce one entry and
  one instance, while activators resolving to different components produce correctly ordered
  co-targeted entries without changing the marker or catalog contract.
- Distribution tests prove shared props reach every selected component that declares them,
  component-specific props reach only their owner, incompatible shared types are diagnosed, and
  complete grouped objects honor union and mutual-exclusion contracts.
- Activator tests prove selector-only activators are erased after selection, reject authored values,
  and add no hidden props, while matching declared activator props accept, type-check, and forward
  their payloads without making falsey values suppress structural selection.
- Resolution tests cover attributed re-exports, aliases, re-export chains, duplicate mappings,
  reserved names, finite spreads, missing props, open prop contracts, and canonical identity across
  several mapped names.
- Adapter tests prove Vite, Webpack, and Bun produce the same bundle-local catalog registrations and
  facades after the terminology migration.
- Ordinary component tests prove `_target` emits no DOM, requires children, works identically under
  explicit and enhancement invocation, permits surrounding wrapper structure, and propagates the
  semantic target through nested component and projected-child boundaries.
- Contribution tests cover scalar precedence, `undefined` fallthrough, `null` suppression, additive
  and deduplicated classes, per-property style merging, standards-defined token lists, ref fan-out,
  independently owned event subscriptions, reactive replacement, and owner-specific cleanup.
- DOM and SSR routing tests prove intrinsic declarations terminate immediately; component
  declarations consume propagated `_target` results before following the first-root fallback path;
  root selectors are limited to the selected target/root-bearing frame; and unrelated nested
  component frames, later containing-frame siblings, and inactive branches are not searched after a
  target frame is established.
- Underscore-fragment tests prove an active enhancement chain occupies the `_` boundary directly,
  accepts text and multi-node output without an intrinsic target, retains authored children as the
  unavailable fallback, bypasses root search and `namespace:root` routing, and preserves keyed
  boundary identity, ordering, ownership, inspection, cleanup, SSR, and hydration behavior.
- Pass-through, fragment, slot, list, and dynamic-range tests prove projected children participate
  in the receiving logical output frame for routing without transferring component or resource
  ownership.
- Conditional, Suspense, and Activity tests protect `_target` appearance/disappearance, dormant
  contribution retention, target and root-frame replacement, fallback/explicit rerouting, parked
  identity retention, generation fencing, and `enhancement-target-rerouted` cleanup.
- SSR/hydration tests prove both hosts choose the same active frame and intrinsic without setting up
  opaque descendant components solely for search, serialize the same layered contributions, and
  reconstruct contribution ownership without unnecessary DOM writes; hydration mismatch retains
  normal recovery.
- DOM, SSR, hydration, and component tests prove active and unavailable enhancements otherwise
  retain current identity, ordering, adoption, optional fallback, and cleanup behavior.
- Language-tool tests cover completion, hover, semantic use, and ordinary diagnostics for the new
  import attribute. Repository consistency checks prove the previous spelling has no remaining
  usages without adding previous-name-specific compiler or language-tool behavior.
- Plugin-host tests prove enhancement metadata alone does not discover or prepare a framework
  plugin.
- The server component-library trust proposal owns security tests for bundler provenance,
  server/client catalog agreement, strict rejection, and inert exclusion before evaluation; the
  compiler suite contains no duplicate trust policy.
- Package tests prove retained host projections remain independently justified and enhancement use
  does not require them.
- Documentation checks prove current references, docs-app pages, package READMEs, local agent
  guides, and the reusable skill use the distinction consistently.

### Delivery evidence

The completed implementation was audited against every acceptance criterion on 2026-08-05. The
native compiler's complete Go suite, the repository build, strict test typecheck, compiler
acceptance applications, publish/package checks, and all package tests passed. The package suite
covered 274 test files and 1,628 tests, with two intentional skips.

The focused production-fixture reroute measurement was repeated on the baseline machine with five
fresh Node processes and two warmups per process. Median enhancement reroute time moved from
0.5466 ms in the tracked pre-implementation baseline to 0.0868 ms, while p95 moved from 0.9097 ms
to 0.0939 ms. Correctness tests additionally assert that unrelated structural updates do not run a
whole-root target walk, unavailable enhancements allocate no component ownership, and DOM, SSR,
hydration, Activity, Suspense, direct `_`, and `_target` generations retain their required cleanup
and identity behavior. The focused diagnostic run does not replace the complete tracked baseline;
the general JavaScript performance proposal owns subsequent whole-suite profiles.

## Acceptance criteria

1. Existing single-component enhancement compilation, emitted metadata, bundle linking, and
   optional runtime activation are behaviorally unchanged.
2. Attributed enhancement source uses `exact-enhancement`, and no supported enhancement surface
   calls it a plugin.
3. Enhancement implementations remain ordinary inspectable eXact components supplied by component
   libraries.
4. Enhancement compilation requires no plugin manifest, discovery, trust decision, configuration
   controller, or host lifecycle; separate bundler authorization applies only when component code
   enters a server-executing artifact.
5. The bundle-local enhancement catalog is never described or implemented as a framework-plugin
   registry.
6. Packages that expose both enhancements and genuine host plugins document and activate those
   surfaces independently.
7. Motion, gestures, physics, and gravity appear under component-library or enhancement ownership
   in repository and public documentation.
8. The emitted metadata provides the complete portable seam required by the subsequent
   bundler-enforced trust proposal. Implementing that authorization policy is not an acceptance
   criterion for this proposal, and no marker interpretation, authorization policy, or duplicate
   diagnostics enter the compiler.
9. A finite enhancement namespace can use several activators to select ordinary components, share
   applicable props across them, and produce exactly one instance for each canonical component at
   one boundary.
10. Activators remain selector-only unless their component explicitly declares a matching prop;
    payload-bearing activators forward that authored prop without changing presence-based selection.
11. Activator-based enhancement namespaces lower to the existing runtime marker and catalog
    contracts without a dispatcher, registry, hidden discriminator, or new component kind.
12. `_target` is an ordinary pseudo-intrinsic with identical behavior in every component invocation;
    it emits no DOM, requires children, allows surrounding wrapper structure, and propagates its
    selected semantic intrinsic through nested component output.
13. `_target` contributions retain per-component ownership and deterministic collision behavior for
    singular attributes, classes, styles, token lists, refs, and events across DOM, SSR, hydration,
    reactive target replacement, and cleanup.
14. An enhancement authored on an intrinsic targets it immediately; an enhancement authored on `_`
    occupies that fragment boundary directly without declaration-level intrinsic-root discovery;
    and any other component declaration consumes an active `_target` export before searching only
    its first-root fallback path and first frame that directly presents an intrinsic.
15. Active `_` enhancement chains support text and multi-node ranges, preserve authored keyed
    identity and transparent unavailable fallback, and use ordinary component ownership, placement,
    inspection, cleanup, SSR, and hydration semantics.
16. Pass-through, conditional, Suspense, Activity, and target-generation changes preserve DOM/SSR
    agreement, bounded invalidation, deterministic rerouting, and ordinary component cleanup.
17. Compiler, language-tool, adapter, renderer, SSR, hydration, plugin-host, package, and
    documentation verification passes.
