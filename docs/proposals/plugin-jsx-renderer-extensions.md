# Plugin-owned JSX attributes and renderer enhancements

## Status

Implemented for the current Vite, DOM, SSR, hydration, and component-test hosts. Stable generic
refs and root releases, grouped reactive markers,
compile-only attributed value imports, checker-derived finite prop schemas and diagnostics,
single-pass logical target discovery, reactive root rerouting, prop merging, transparent or
structural ordinary component activation, target-bound lifetime, inert unavailable behavior,
warning deduplication, bundle-local Vite catalog carriage, SSR activation, hydration adoption, and
component-test host propagation exist. Compilerless package components attach the same generic
context-token ordering contract explicitly. Non-Vite adapters still require equivalent catalog
facades before they provide the same automatic bundle integration.

## Decision summary

- A plugin component is an ordinary eXact component. It can always be exported
  and used as an ordinary component.
- An export becomes a plugin-capability export only at an export edge carrying
  `with { type: 'exact-plugin' }`.
- A consuming JSX file must use an attributed value import. The local import
  binding supplies the authored JSX prefix but has no effect on canonical
  identity.
- Beginning at the module resolved for the consuming import, canonical identity
  comes from the first valid attributed export edge on the uniquely resolved
  ECMAScript export path: resolved public module identity plus export name.
  There is no authored plugin ID.
- The compiler emits one grouped enhancement marker per JSX boundary. Its
  entries and prop values remain reactive through ordinary eXact prop
  machinery.
- Only canonical props derived from the plugin component's public prop type are
  forwarded. `children`, `key`, and `ref` are reserved and never canonical.
- Markers forward through ordinary components until the renderer resolves an
  intrinsic enhancement target. Different plugins may select different targets.
- A plugin component becomes a real, inspectable component instance tied to a
  resolved enhancement-target identity and generation. No resolved target means
  no instance.
- Plugin components may render transparently, wrap the target, or replace it.
  Structural DOM output is an author capability, not the default recommendation.
- Component contexts determine enhancement ordering. The compiler projects a
  minimal generated context contract; authors do not duplicate dependencies in
  plugin metadata.
- All enhancements are optional. An inactive plugin never prevents the
  underlying target from rendering.
- The compiler records the resolved capability independently of any plugin
  registry. The final application either bundles that package capability or
  does not; package inclusion is the activation trust boundary.
- Stable generic refs and element-root generation-fenced release primitives
  belong in the framework and are reused by every plugin package.
- Existing component placement, task, SSR, hydration, error, Suspense,
  Activity, microfrontend, and serialization semantics remain authoritative.
- No enhancement-marker-specific version or negotiation field is introduced.

## Goals

1. Let packages add type-safe, namespaced JSX capabilities without changing
   ordinary component prop declarations or emitting plugin attributes into DOM.
2. Preserve eXact's setup-once component, precise reactivity, context, task,
   lifecycle, ownership, and inspection behavior inside plugin components.
3. Allow markers to cross precompiled component libraries and dynamic
   `Child[]` trees without recompiling those libraries.
4. Resolve targets deterministically across fragments, component output,
   Suspense, Activity, portals, keyed collections, and microfrontends.
5. Reuse existing renderer and compiler behavior instead of creating a parallel
   component, transport, scheduler, lifecycle, or trust system.
6. Keep inactive enhancements safe and functionally optional.

## Non-goals

- React-style higher-order components, hooks, synthetic provider elements, or
  repeated component execution.
- Runtime scanning of arbitrary prop names for plugin prefixes.
- A second plugin registry, allowlist, bundle loader, or authorization layer.
- Plugin-specific server/client placement or serialization rules.
- Making optional enhancements responsible for required application behavior.
- Hiding active plugin failures or validation errors.
- Inferring narrow DOM root types that TypeScript already cannot prove.
- Adding marker schema versioning before independently evolving compiler and
  renderer contracts require it.

## Attributed exports and canonical identity

The implementation component is ordinary eXact code:

```tsx
export interface MotionElementProps {
	preset?: MotionPreset;
	duration?: number;
	children?: Child;
}

export function MotionElement(this: Component<MotionElementState>, props: MotionElementProps) {
	const root = this.refs.root<HTMLElement>();

	async function applyMotion(
		element: HTMLElement | undefined,
		presented: boolean,
		preset: MotionPreset | undefined,
		duration: number | undefined,
		task: TaskContext = TaskContext.client().latest().nonblocking()
	) {
		if (!element || !presented || !preset) return;
		await playMotion(element, preset, duration, task.signal);
	}

	applyMotion(root.current, root.presented, props.preset, props.duration);

	return () => props.children;
}
```

It becomes a plugin capability only at an attributed export:

```ts
export { MotionElement as motion } from './MotionElement.js'
	with { type: 'exact-plugin' };
```

The canonical identity is derived from the resolved public module and export.
For example, the export above from `@exactjs/motion` is
`@exactjs/motion#motion`. A default export is `@exactjs/motion#default`.
Subpath exports retain their resolved public subpath.

Starting with the module resolved for the consuming import, the compiler follows
the uniquely resolved ECMAScript export path. The first valid edge carrying
`type: 'exact-plugin'` establishes canonical identity; ordinary re-exports are
transparent and continue along that path. Standard resolution ambiguity or
failure is a compiler diagnostic.

Canonical identity does not come from:

- the consuming file's import spelling or path alias;
- the local import binding;
- the component function's source module;
- a component property or explicit ID; or
- the package-level plugin-host `configKey`.

This permits organization-owned wrappers:

```ts
export { MotionElement as motion } from '@exactjs/motion/internal'
	with { type: 'exact-plugin' };
```

Consumers resolve the wrapper's public identity. The organization may later
replace the underlying compatible component without changing authored JSX.

### Re-exports and barrels

An ordinary named or star re-export is transparent and preserves a downstream
plugin-capability identity:

```ts
export * from './enhancements.js';
```

An attributed named re-export establishes a new capability identity. An
attributed star re-export establishes wrapper identities for each forwarded
native eXact component under its forwarded export name:

```ts
export * from './enhancements.js' with { type: 'exact-plugin' };
```

Non-component values continue to be ordinary exports. Attempting to consume
one as an exact plugin is a compiler diagnostic. Normal ECMAScript shadowing,
ambiguity, default-export, and named-export rules continue to apply.

Only default and named value imports may establish JSX prefixes. Namespace,
type-only, and dynamic imports cannot do so. An attributed import may not mix
plugin-capability values with ordinary values.

## Authored JSX and canonical props

The local attributed-import binding exclusively defines the lexical prefix:

```tsx
import motion from '@exactjs/motion'
	with { type: 'exact-plugin' };
import { gestures as input } from '@exactjs/gestures'
	with { type: 'exact-plugin' };

function SaveCard() {
	return () => (
		<Card
			motion:preset="fade"
			motion:duration={180}
			input:draggable
		/>
	);
}
```

Renaming `input` changes only this file's JSX spelling. The canonical identity
still comes from the attributed export.

The compiler derives canonical props from the plugin component's public prop
type. Camel-case component props use kebab-case JSX names when TypeScript and
the language server can normalize them without weakening type checking:

```ts
interface MotionElementProps {
	layoutId?: string;
	initialVelocity?: number;
}
```

```tsx
<Card motion:layout-id={id} motion:initial-velocity={velocity} />
```

The accepted prop type must resolve to a finite, semantically unambiguous set of
string keys. Interfaces, `Pick`, intersections, finite mapped types, and finite
unions are valid. Open index signatures and unresolved generic key spaces are
diagnostics. Finite unions preserve their cross-property constraints in JSX.

`children`, `key`, and `ref` are never canonical. Prefixed forms such as
`motion:key` and `motion:ref` are invalid. `key` retains its ordinary authored
structural meaning at the outer JSX boundary.

### Statically finite spreads

Spreads may contribute enhancement attributes only when semantic analysis can
enumerate their locally namespaced keys:

```tsx
const effects = {
	'motion:preset': this.state.preset,
	'motion:duration': this.state.duration
};

return () => <Card {...effects} />;
```

`effects` follows ordinary eXact setup-derived semantics. Its identity-bearing
object value is a derived reactive value whose state reads remain dependencies;
the spread consumes its current value. Enhancement spreads do not introduce a
plugin-specific snapshot or reactivity rule.

Open dictionaries and runtime-computed property names cannot create
enhancement entries. The runtime never scans strings for prefixes. Normal JSX
left-to-right precedence applies among spreads and direct attributes; repeated
direct attributes retain the ordinary duplicate-attribute diagnostic.

## Grouped reactive marker

Each JSX boundary carries at most one opaque framework marker. Conceptually:

```ts
{
	enhancements: {
		'@exactjs/motion#motion': {
			preset: reactivePresetSlot,
			duration: reactiveDurationSlot
		},
		'@exactjs/gestures#gestures': {
			draggable: reactiveDraggableSlot
		}
	}
}
```

This is an internal representation, not an authored object or DOM attribute.
The envelope groups routing information; each value uses existing reactive prop
bindings. Updating one expression updates ordinary consumers in the active
plugin component without recreating the marker, target, or component instance.

Structural entry presence controls lifecycle independently of values. An entry
whose values are all `undefined` still exists, just as an ordinary component
with undefined props still exists. Removing the entry structurally removes its
enhancement instance.

The marker uses existing component-prop transport. It does not define a second
serialized prop payload. Existing placement and serialization checks determine
whether a value may cross a server/client boundary.

## Forwarding and prop merging

Only canonical enhancement entries forward through ordinary components.
Arbitrary undeclared attributes do not forward. At each component boundary,
the conceptual merge is:

```ts
pluginProps = {
	...inheritedPluginProps,
	...actualPropsExceptDeclaredComponentProps
};
```

The real implementation partitions values by canonical identity and prop.
Nearest values win. Explicit `undefined` is still a value and overwrites a more
distant value. When paths carrying the same canonical identity converge on the
same enhancement target, they create one instance with the merged props.

Forwarding is renderer metadata, not an addition to the component's authored
`children` value. Precompiled components that project `{props.children}` need
no recompilation; dynamic resolution occurs during the normal render traversal.

## Enhancement-target selection

Different plugins may select different enhancement targets. The reserved
lexical attribute `namespace:root` selects a target only for that canonical
plugin identity:

```tsx
function Card() {
	return () => (
		<section motion:root>
			<div input:root>{props.children}</div>
		</section>
	);
}
```

`namespace:root` is not a plugin prop and never reaches DOM. It is a reactive
boolean selector: bare syntax means `true`; `false`, `null`, and `undefined` do
not select. A changed selection participates in normal reconciliation.

For each canonical identity, enhancement-target resolution performs one
depth-first search through the current logical tree:

1. Remember the first intrinsic element encountered.
2. Continue until the first active matching explicit target is found.
3. Return that explicit target immediately.
4. If none is found, return the remembered first intrinsic element.

The traversal follows fragments, native eXact components, selected Suspense and
Activity branches, retained ranges, keyed collections, and portals according to
logical ownership. It stops at opaque foreign-runtime boundaries unless their
adapter exposes an explicit traversal contract.

The compiler may lower a statically direct route. Dynamic and precompiled
`Child[]` paths integrate discovery into the renderer's normal traversal rather
than performing a second tree walk. The compiler emits no public stable versus
replaceable classification and no redundant finite root-tag inventory.

## Plugin component instances and output

An active enhancement is a real component instance. It receives ordinary
reactive props plus exactly one logical child representing the next inner
enhancement or resolved target. It may project that child no more than once.

The component may:

- return the child unchanged;
- wrap it in structural DOM;
- select a different intrinsic root with an ordinary element ref; or
- omit or replace it when that is the package's documented behavior.

Structural output can affect selectors, layout, accessibility, hydration, and
CSS. The framework permits it because ordinary components already can do so,
but transparent output should remain the default for optional visual or input
enhancements.

The enhancement target is resolved before the ordered plugin component chain is
constructed. Each plugin component then has its own ordinary component root:

1. an explicit binding passed to `this.refs.root(binding)` wins;
2. otherwise the first intrinsic in its output is its root;
3. a transparent component naturally resolves through its sole child; and
4. a structural wrapper naturally becomes the root.

The enhancement target and a plugin component's root are deliberately separate.
Wrapping the child can change that component's root without changing the target
to which the enhancement declaration is attached.

### Enhancement-target-bound identity

The marker declaration remains attached to its authored boundary, but an
enhancement instance is keyed by canonical identity and resolved enhancement-
target identity and generation. This keeps target-specific state with its target.

- Reactive prop changes on the same target preserve the instance.
- Keyed reordering preserves it when the renderer preserves target identity.
- Activity parking and portal movement preserve it when logical identity remains.
- Replacing the enhancement target disposes the old instance and creates a new
  instance.
- Replacing only a plugin component's rendered root preserves its ordinary
  component instance while advancing that root's lifecycle generation.
- With no resolved intrinsic target, the declaration remains dormant and no
  instance exists.
- A later target creates a new instance using the latest reactive prop values.
- A reversed removal may restore the old instance only while the exact retained
  enhancement-target generation remains under its pre-unmount lease.

## Context-derived ordering

There are no plugin-specific `requires`, `inside`, or `outside` declarations.
Ordinary component context behavior supplies ordering:

- `setContext(Token, value)` produces `Token` for descendants.
- Unconditional `getContext(Token)` consumes it as required.
- `hasContext(Token)` records optional consumption.
- If a co-targeted plugin component produces an optionally consumed token, it
  is placed outside the consumer; absence remains ordinary optional behavior.
- An ordinary ancestor may already satisfy either consumption.
- Unrelated enhancement components use canonical identity as a deterministic
  tie-break.

The compiler follows statically resolvable local helpers and imported callable-
effect summaries using its existing transitive context analysis. A context read
reached unconditionally is required; `hasContext()` and conditionally reached
reads are optional. Opaque or dynamically dispatched reads are reported as
unknown by language tools and do not invent an ordering edge. Existing compiler
annotations may resolve an otherwise opaque boundary.

The compiler reuses its existing context-read and context-write analysis to
emit the minimal semantic component contract required before instantiation:

```ts
{
	provides: [PhysicsContext],
	requires: [WorldContext],
	optionallyConsumes: [ReducedMotionContext]
}
```

This metadata contains token references, not values. It is runtime semantic
data rather than optional inspection data. Statically known cycles are build
diagnostics; dynamically assembled cycles fail deterministically before any
component in the cycle is instantiated. Existing global/shared context rules
remain responsible for cross-bundle and microfrontend token identity.

## Generic refs and element-root lifecycle

Plugin packages require target acquisition and release, but those capabilities
are general framework behavior. `RefBinding<T>` remains generic: a ref may hold
an element, component instance, controller, resource, or other imperative value.

```ts
interface RefValue<T> {
	readonly current: T | undefined;
}

interface RefBinding<T> extends RefValue<T> {
	readonly key: RefKey<T>;
	readonly owner: ComponentInstance<any>;
	fulfill(value: T | undefined): void;
}

interface RootLifecycle<T extends Element> extends RefValue<T> {
	readonly generation: number;
	readonly introduction: 'initial' | 'hydration' | 'update' | undefined;
	readonly presented: boolean;
	readonly release: RootRelease<T> | undefined;
}

interface RootRelease<T extends Element> {
	readonly target: T;
	readonly generation: number;
	readonly reason: StructuralReleaseReason;
	readonly presented: boolean;
}

interface RootBinding<T extends Element> extends RefBinding<T>, RootLifecycle<T> {}

interface RefRegistry {
	get<T>(key: RefKey<T>): T | undefined;
	root<T extends Element = Element>(): RootLifecycle<T>;
	root<T extends Element>(binding: RefBinding<T>): RootBinding<T>;
}
```

`this.ref(key)` returns one stable reactive binding per component and key.
`binding.current` and `this.refs.get(key)` read the same key-scoped reactive
slot. DOM elements are never proxied. Arbitrary ref values have no structural
generation, presentation, or release contract. The generic no-argument root
type is an authored expectation; the compiler or language server reports a
mismatch when it can prove one. Passing an element-valued binding to
`root(binding)` returns that same stable binding augmented with intrinsic-root
lifecycle.

`presented` means that the value belongs to the renderer's currently presented
logical range, not CSS visibility. Suspense candidates and precommit hydration
may be fulfilled but unpresented. Activity parking changes presentation without
clearing or releasing the ref.

`introduction` classifies the commit that first published the current root
generation. Initial client rendering and hydration adoption are distinct from
a root introduced by a later update. Exact release reversal restores the same
generation and introduction rather than pretending that retained DOM is new.

### Release and reasons

`release` represents structural loss of one intrinsic component root generation.
Public `fulfill()` remains ordinary ref assignment and never creates structural
release or DOM retention. Renderer-owned root replacement or removal publishes
the release and retains the old root until joined task descendants settle or
are cancelled.

The framework uses one namespaced reason vocabulary across root release,
component deactivation/unmount, and task cancellation, including:

- `reconcile-removed`, `reconcile-replaced`;
- `suspense-content-replaced`, `suspense-candidate-discarded`;
- `enhancement-target-rerouted`, `root-unmounted`, `owner-disposed`;
- `activity-parked`, `activity-background`; and
- `release-reversed`.

The release frame reuses existing task-child capture and `afterChildren`
settlement. Plugin tasks receive the release and current prop values as explicit
invocation arguments rather than reading reactive values through default
parameters:

```ts
async function leave(
	release: RootRelease<Element> | undefined,
	definition: MotionDefinition | undefined,
	task: TaskContext = TaskContext.client().latest().immediate().nonblocking()
) {
	if (!release || !release.presented || !definition) return;
	await playMotion(release.target, definition, task.signal);
}

leave(root.release, props.leave);

return () => props.children;
```

Release is generation fenced. Reversal cancels old work with
`release-reversed`. Failures follow ordinary error handling, but structural
removal always completes. There is no universal timeout; root shutdown cancels
immediately and DevTools reports long-running release frames.

There is at most one active release for one root lifecycle. A newer structural
release cancels and finalizes the previous one. When one structural range change
releases several intrinsic roots, the renderer groups those releases under its
existing consequence frame and waits for their attached tasks; it does not
expose a public release array or retention token. Explicit presence components
coordinate policy and sequencing through the same task tree while the renderer
continues to own and retain the affected ranges.

The implementation must update every framework path that directly fulfills or
clears refs so generic slots stay synchronized and renderer-owned element roots
publish the appropriate lifecycle. The audit includes DOM mount, hydration,
keyed reconciliation, registries, Suspense, Activity, retained ranges, portals,
ErrorBoundary fallback, server patches, root teardown, compatibility adapters,
testing, and inspection. This is framework cleanup, not plugin-specific
duplication.

## Runtime activation, bundling, and warnings

Marker emission is safe and inert. For every attributed import, the compiler
emits build metadata containing the canonical identity and resolved runtime
module export. It does so without loading or consulting a plugin registry; a
library cannot know the final application's bundle policy.

The application build adapter links only metadata reached by compiled
application modules into one bundle-local generated catalog. Consequently the
application either bundles a package capability or does not. That package-level
bundle decision is the trust and activation boundary. Wrapper exports retain
their canonical wrapper identity while importing the normally compiled public
component export. The generated catalog is passed into each renderer root; it
is not an authored registry or a process-global component map.

The outcomes are:

| Resolution                                   | Behavior                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| Component included in the application bundle | Instantiate the ordinary plugin component.                                |
| Capability absent from the server bundle     | Render unchanged and warn once per canonical identity and server host.    |
| Capability absent from the client bundle     | Render unchanged and warn once per canonical identity and client runtime. |
| Bundled export is missing or not a component | Fail the build or generated catalog initialization.                       |

Server warnings use the existing logger and never include prop values. No
server trust list or ignored-package policy is serialized to the client. No
enhancement-specific production mode or warning-suppression configuration is added.

All enhancements remain optional. Packages that provide required application
behavior must expose and document an explicit ordinary component instead.
Active plugin prop and composition validation belongs to ordinary plugin
component code, especially for complicated runtime unions. Inactive entries are
not validated. When an active enhancement can safely decline invalid input, it
reports a structured component error through `this.log.error()` and returns its
child unchanged; the framework adds no error deduplication or throttling.
Operational failures that are thrown still use ordinary ErrorBoundary behavior.
Neither form is silenced or reclassified as an unavailable-plugin warning.

## Placement, SSR, hydration, and microfrontends

Plugin components use only ordinary compiler-derived placement:

- universal components participate in SSR and hydration normally;
- client components activate through existing client-component behavior;
- server components contribute ordinary server output and protocol state; and
- tasks retain their inferred or explicit placement.

Enhancement props use ordinary VNode and component-prop transport. Only
canonical marker identity and root-routing information are new renderer data.
There is no plugin-specific serialization payload, hydration algorithm, or
server/client placement policy.

Microfrontends carry grouped markers through the existing eXact protocol and
resolve them against the generated catalog of the renderer root that owns the
logical target. Portals retain logical source ownership. Remote roots cannot
activate components in another root or disclose another server's allowlist.

The first implementation adds no enhancement marker schema version. Existing
coordinated compiler/runtime builds, build fingerprints, and generic hydration
compatibility remain authoritative. Marker versioning may be introduced later
only if this contract needs to evolve independently.

## Compiler and language-tool changes

The compiler must:

1. resolve attributed import and export edges through real module resolution;
2. derive canonical identities from the first valid attributed export edge on
   the uniquely resolved ECMAScript export path;
3. support attributed named, default, and star re-exports under the rules above;
4. derive finite canonical prop schemas and preserve TypeScript unions;
5. augment JSX checking for local namespaced attributes and `namespace:root`;
6. accept only statically finite enhancement keys from spreads;
7. emit one grouped reactive marker per boundary;
8. forward only canonical props through native eXact component output;
9. reuse context analysis to emit minimal ordering contracts;
10. lower direct target routes where proven without exposing stability metadata;
11. include canonical source provenance in optional inspection catalogs; and
12. diagnose reserved props, ambiguous exports, unresolved schemas, invalid
    roots, unsupported imports, and statically known ordering cycles.

The language server should present the same inferred canonical identity, prop
mapping, target route, context ordering, and reactive dependency information. No
compiler-emitted inspection catalog is required for runtime correctness beyond
the narrow semantic contracts named above.

## Delivery plan

### Phase 1: general lifecycle foundation

- Make `this.ref(key)` stable and reactive.
- Add stable generic ref bindings plus element-root discovery, presentation,
  releases, and shared reasons.
- Replace every framework path that directly fulfills or clears refs.
- Add generation-fenced pre-unmount task frames and reversal.

### Phase 2: compiler surface

- Add attributed export/import resolution and canonical identity.
- Add TypeScript JSX augmentation, canonical props, finite spreads, root syntax,
  and grouped reactive marker emission.
- Emit the minimal context-ordering contract.

### Phase 3: renderer activation

- Integrate forwarding and single-pass target discovery into normal traversal.
- Merge converging entries and construct context-ordered component chains.
- Implement enhancement-target-bound identity, dormant declarations,
  component-root release, and structural output.

### Phase 4: coordinated renderers and tooling

- Carry markers through SSR, hydration, patches, portals, microfrontends,
  testing renderers, and compatibility boundaries.
- Add server/client unavailable warnings and DevTools inspection.
- Add compiler and language-server explanations and diagnostics.

### Phase 5: packages

- Implement motion, gestures, physics, and gravity as independent ordinary
  plugin components using only the shared foundation.

## Testing strategy

Testing follows the repository's risk-based standard:

- compiler semantic tests for import/export resolution, aliases, barrels,
  wrapper identities, finite unions, spreads, and diagnostics;
- compiler/runtime contract tests proving values remain reactive and no
  canonical attributes reach DOM;
- property-oriented merge and target-search tests over fragments and component
  paths;
- DOM identity tests for keyed moves, enhancement-target replacement,
  component-root replacement, dormant markers, release reversal, Activity,
  Suspense, portals, and structural output;
- context graph tests for required/optional ordering, ancestor satisfaction,
  deterministic ties, and cycles;
- SSR/hydration/microfrontend tests for precompiled children and coordinated
  server/client behavior;
- bundle tests proving markers activate only capabilities linked into the final
  application without revealing server policy;
- warning deduplication tests for unavailable server and client identities; and
- compatibility tests for arbitrary non-element refs and existing ref timing.

## Acceptance criteria

1. A local attributed import provides a typed JSX prefix without defining
   canonical identity.
2. The first valid attributed export edge on the uniquely resolved ECMAScript
   export path defines canonical module-plus-export identity without an authored
   ID.
3. Ordinary imports and ordinary component use remain valid for the same
   implementation component.
4. One grouped marker carries all canonical entries at a JSX boundary, and each
   prop remains independently reactive.
5. Only finite, canonical props forward; `children`, `key`, and `ref` never do.
6. Direct attributes and statically finite spreads receive TypeScript-accurate
   checking, including union constraints.
7. Enhancement-target resolution follows the agreed one-pass depth-first
   explicit-target-first algorithm through dynamic and precompiled native trees.
8. Plugin components are ordinary inspectable instances whose lifecycle is tied
   to resolved enhancement-target identity and generation, independently of
   their ordinary component-root lifecycle.
9. Different plugins may select different targets and may render transparent or
   structural output.
10. Context production and consumption determine ordering without authored
    plugin dependency metadata.
11. Generic refs remain reactive for arbitrary values, while element roots add
    presentation, generation-fenced release, shared reasons, and task settlement
    consistently across every renderer lifecycle path.
12. Inactive enhancements always render the underlying target, and unavailable
    identities warn once in each applicable runtime.
13. Package inclusion remains the activation and trust decision, while existing
    placement, errors, SSR, hydration, serialization, portals, and
    microfrontend ownership remain authoritative.
14. The implementation adds no second registry, transport payload, lifecycle
    system, trust list, client allowlist disclosure, or marker version field.
