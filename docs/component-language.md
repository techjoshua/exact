# Component language

This is the authoring reference for native eXact components. It covers the
TypeScript and TSX forms that the compiler gives framework meaning to. Ordinary
TypeScript keeps its ordinary JavaScript semantics unless this document says
otherwise.

eXact lets you describe a component using ordinary TypeScript, then compiles that description into
a reactive state machine with seamless client and server execution defined in the same component.
This reference explains how source declarations become state, transitions, dependencies, tasks,
and connected render regions in that machine.

The reference describes source code, not generated `.exact.client`,
`.exact.server`, or `.exact.shared` artifacts. Those files are build output and
are not an application authoring surface.

Compiler-aware editor support exposes the same language model without requiring
generated-code inspection. eXact Language Tools identifies component initialization
declarations, reactive render regions, inferred and explicit tasks, interactions,
derived values, bindings, and lifecycle registrations; each classification
links to the compiler-owned source evidence behind it. See
[Compiler-aware language tools](language-tools.md).

## Imports and JSX configuration

Application TSX uses the automatic JSX runtime:

```json
{
	"compilerOptions": {
		"jsx": "react-jsx",
		"jsxImportSource": "@exactjs/jsx"
	}
}
```

The component-facing primitives used below are exported by `@exactjs/core`:

```tsx
import {
	Activity,
	Suspense,
	batch,
	createContext,
	createPortal,
	createRef,
	peek,
	unsafeHtml,
	type Child,
	type Component
} from '@exactjs/core';
```

Renderer and application packages may expose additional APIs, but they do not
change the component language described here.

### JSX text whitespace

Multiline JSX text follows HTML-like authoring whitespace. Line breaks and surrounding indentation
collapse to a single space between meaningful text, elements, and expressions; whitespace at the
start or end of a child list is discarded, and indentation before closing punctuation does not
create a visible space. Single-line authored text is preserved. Write ordinary spaces in prose
instead of inserting explicit one-space expressions between children:

```tsx
<p>
	Hello <strong>{props.name}</strong>, your report is ready.
</p>
```

This produces the same text boundaries as `Hello <strong>…</strong>, your report is ready.` without
creating reactive space expressions. Explicit string expressions remain appropriate only when the
exact whitespace itself is dynamic or intentionally significant.

## Component declarations

An eXact component function is a compiler-analyzed definition for one durable component
instance. The usual declaration gives `this` a state type and gives the second
parameter a props type:

```tsx
type CounterState = {
	count: number;
};

type CounterProps = {
	step?: number;
	children?: Child | Child[];
};

export function Counter(this: Component<CounterState>, props: CounterProps) {
	this.state.count = 0;

	return () => (
		<button onClick={() => (this.state.count += props.step ?? 1)}>
			{props.children}
			{this.state.count}
		</button>
	);
}
```

The outer function is not an ordinary linearly executed setup callback. It describes default state,
task definitions, reactive task relationships, and preparation of the returned render function.
The compiler preserves ordinary TypeScript evaluation semantics while turning those facts into a
reactive state machine. Each mounted component owns one durable instance of that machine. Props are
parent-owned reactive inputs. State, tasks, contexts, refs, lifecycle registrations, and logging
belong to that durable instance.
The runtime keeps that ownership inspectable without allocating a separate
method closure or empty collection for every capability on every instance.
Stable component and logging methods are shared. Refs, list caches, contexts,
lifecycle storage, task collections, and lifecycle cancellation are
materialized when the component actually uses them. This does not make
extracted unbound component methods valid: component methods use their
instance receiver.
Compiled artifacts also import ref and keyed-list ownership through focused runtime entries. A
component graph without `this.ref`, `this.readRef`, `this.refs`, or `this.map` does not retain those
implementations merely because the shared component interface exposes the methods.
Reactive ownership follows the same rule: effect-scope methods are shared and
their child, reaction, cleanup, and pause-waiter collections are created on
first use. A DOM binding that observes no reactive dependency applies its value
once and releases its watcher and binding-table entry; reactive expressions
continue to retain ordinary fine-grained update behavior.
A computed expression captures reactive ownership where it is created, not
where its lazy first read happens. Consequently, a reusable expression sampled
during SSR remains live for a later hydration owner instead of being disposed
with the completed server render.
Readonly prop tracking traverses plain objects and collections. Opaque class
instances retain their authored identity even when supplied by a reactive JSX
expression, so resource methods may mutate their own private state without
being mistaken for writes to the parent-owned prop binding. Frozen,
non-writable object properties likewise retain their exact authored values as
required by JavaScript proxy invariants. An explicitly reactive value stored in
such a property remains reactive through its own identity.
Component prop reads always return the authored value, including primitive
values used by control flow. When a compiled server or isomorphic task also
depends on that prop, the runtime retains its readiness, generation, and
cancellation source as hidden execution-plan wiring rather than exposing the
reactive or continuation wrapper to component code.

Every component accepted by the native renderer is compiler-branded. The key
`Symbol.for('@exactjs/component')` stores the component's opaque stable ID; a
function name or setup/render shape is never sufficient runtime ownership.
Published libraries carry precompiled target-local component artifacts, so an
application can consume them without recompiling their source. React, Preact,
and other foreign functions remain outside native component ownership and cross
their explicit compatibility adapter.

The compiler discovers function declarations and function-valued variable
declarations. An uppercase function that contains JSX is a component by
convention. A typed `this: Component<...>` receiver or use of the component
protocol also identifies component ownership. Durable component definitions
belong at module scope so every emitted target and package export receives one
stable artifact identity. Use a component-body-local PascalCase view arrow for
a lexical micro-component; a nested durable component declaration is rejected.

### Return forms

The normal return value is a synchronous render function:

```tsx
function Greeting(this: Component<{}>, props: { name: string }) {
	return () => <p>Hello, {props.name}</p>;
}
```

A component may return a render result directly when it does not need a
separate setup/render boundary:

```tsx
function Rule() {
	return <hr />;
}
```

The direct form is source convenience. The compiler immediately normalizes it
to the same setup-plus-view representation; renderers do not carry a second
component contract. Use the returned-function form whenever setup establishes
owned state or work.

A render result may be a vnode, a string, a number, a boolean, `null`,
`undefined`, an object understood by the renderer such as a reactive value, or
an array of children. `null`, `undefined`, and booleans do not create visible
text.

### Component values

Declared components, immutable aliases, local component functions, and finite
conditional choices may be used as JSX tags:

```tsx
const Compact = ResultList;

function Results(this: Component<{ layout: 'grid' | 'list' }>) {
	const View = this.state.layout === 'grid' ? ResultGrid : Compact;
	return () => <View />;
}
```

A reactive choice owns a dynamic slot and replaces only that subtree. Keep a
choice in the component body as an ordinary compiler-observed derived value. The returned
view remains one expression regardless of how many consumers share it.

```tsx
const Widget = createComponentRegistry(({ lazy }) => ({
	grid: GridWidget,
	table: lazy(() => import('./TableWidget.js').then(({ TableWidget }) => TableWidget))
}));

type WidgetKey = KeyOf<typeof Widget>;

function Dashboard(this: Component<{ widget: WidgetKey }>) {
	const Current = Widget[this.state.widget];
	return () => <Current />;
}
```

Component registries are immutable module-level declarations. Static members such as
`<Widget.grid />` retain entry-specific props and tree shaking. Dynamic selection must be finite
through `KeyOf<typeof Widget>` or a successful `hasComponent(Widget, untrustedKey)` check.
Registry keys are component identity: changing keys replaces only the registry-owned component
range, while same-key prop updates retain the instance. Lazy entries deduplicate loading and
participate in `Suspense`; `preloadComponent()` starts loading without constructing an instance.
Use `renderComponent()` with `ComponentSelection<typeof Widget>` when heterogeneous entries need
correlated key-specific props.

Target-specific compiler brands are emitted as pure attachments. A production bundler may therefore
remove an unreachable component and its brand together; referenced components retain the same
runtime identity and ownership contract.

Mutable dictionaries, reassigned component variables, and unproven string lookups remain
diagnostics because they do not provide a finite component, placement, or artifact graph.

## Component definition, render, and deferred callbacks

Source belongs to one of three important semantic regions:

- the component body supplies state defaults, tasks, reactive relationships, and render preparation;
- the returned view expression establishes compiler-owned reactive regions; and
- event, task, lifecycle, timer, and other callbacks execute when activated later.

The component body may initialize state, create derived values, declare tasks and lifecycle work,
publish context, and create refs. Do not reason about it as an imperative callback that the runtime
walks from top to bottom: the compiler may emit independent states, transitions, dependencies, and
render regions while preserving their documented dependencies and observable ordering.
The returned render function
contains only its view expression. Put declarations and imperative control flow
in the component body; keep conditional tree logic and keyed iteration in JSX:

```tsx
function Summary(this: Component<SummaryState>) {
	const visible = this.state.rows.filter((row) => !row.hidden);

	return () =>
		visible.length === 0 ? (
			<Empty />
		) : (
			<section>
				{visible.map((row) => (
					<Row key={row.id} row={row} />
				))}
			</section>
		);
}
```

A render function contains one synchronous expression. It may not declare
locals, introduce statement control flow, write component state, register task
or lifecycle work, schedule asynchronous work, or perform known DOM, storage,
timer, or other external effects. Interaction callbacks nested in JSX are
deferred work and may mutate state normally.

### Lexical micro-components

The component body may name small view-only arrows and compose them as JSX tags:

```tsx
function Article(this: Component<ArticleState>) {
	const Footer = (props: { prefix?: string } = {}) => (
		<footer>
			{props.prefix}
			{this.state.copyrightText}
		</footer>
	);
	const Page = () => (
		<article>
			<ArticleBody />
			<Footer />
		</article>
	);

	return () => <Page />;
}
```

`Footer` and `Page` are micro-components, not durable component instances.
They capture `Article`'s lexical `this`, receive ordinary props, and may compose
other micro-components in scope. The compiler lowers their JSX tags to
owner-local view calls, attributes their reactive expressions to `Article`,
and gives them no component identity, state, lifecycle, tasks, refs, or
registry entry. A micro-component is an immutable, PascalCase, synchronous
arrow declared in the component body and contains one view expression. It cannot
escape its owner. The component definition returns a component-local view arrow;
module-level shared or bound render callables are not supported.

Compiler-owned lexical capabilities follow the micro-component back to its durable owner. For
example, a prop-bearing micro-component may contain `time:update`; each invocation receives a
distinct mounted clock range and input anchor while the ranges share the owner-independent clock
scheduler. Moving the same JSX into an ordinary durable child component makes that child opaque and
requires it to declare its own enhancement.

## State

`this.state` is a deeply reactive, instance-owned object. Read it normally and
mutate it normally:

```tsx
this.state.profile = { name: 'Ada', tags: [] };
this.state.profile.name = 'Grace';
this.state.profile.tags.push('compiler');
```

Reads connect the current compiler-owned expression, task, list, or derived
value to the path it consumes. Writes transition the existing component state machine rather than
calling the component again to redescribe its interface.

The compiler assigns stable storage slots to known top-level fields, including fields reached
through a state alias. This is transparent to application code and inspection: nested mutable
values remain deeply reactive, dynamically indexed fields remain supported, and snapshots,
DevTools, optimistic rollback, and server resumption continue to observe an ordinary state object.

### Supported writes

The compiler preserves JavaScript evaluation order and expression results for:

- simple, chained, compound, and logical assignment;
- prefix and postfix increment or decrement;
- `delete`;
- static and dynamic computed paths in client-local work;
- array `copyWithin`, `fill`, `pop`, `push`, `reverse`, `shift`, `sort`,
  `splice`, and `unshift`;
- `Map.set()`, `Map.delete()`, `Map.clear()`, `Set.add()`, `Set.delete()`,
  and `Set.clear()`;
- `Object.assign()`; and
- array and object destructuring assignment.

```tsx
this.state.a = this.state.b = 0;
consume((this.state.total += calculate()));
this.state.enabled ||= defaults.enabled;
this.state.rows[index].selected = true;
delete this.state.cache[key];
Object.assign(this.state.profile, patch);

[this.state.first, this.state.second] = pair;
({ name: this.state.name, role: this.state.role = 'reader', ...this.state.extra } = record);
```

Destructuring may mix state and local targets in callbacks. Defaults, rest
targets, aliases, holes, and computed keys retain the native destructuring
algorithm: the right side is evaluated once, targets publish left to right,
iterator cleanup and partial writes follow JavaScript, and the assignment
expression returns the right-side value.

Immutable aliases to state objects and statically destructured aliases remain
observable until the alias is reassigned:

```tsx
const profile = this.state.profile;
const { settings } = this.state;

profile.name = 'Ada';
settings.compact = true;
```

State may not be the assignment target of a `for-in` or `for-of` header. Assign
the iteration value explicitly inside the body. Reflective mutation through
`Reflect.set()`, `Reflect.deleteProperty()`, `Reflect.defineProperty()`,
`Object.defineProperty()`, or `Object.defineProperties()` is rejected because
it cannot preserve the precise write contract.

`Map` and `Set` participate in deep reactivity while preserving their native
JavaScript APIs:

```tsx
this.state.prices.set(productId, nextPrice);
this.state.prices.delete(discontinuedId);
this.state.selected.add(productId);
this.state.selected.clear();

return () => (
	<output>
		{this.state.prices.get(productId)}
		{this.state.selected.has(productId) ? 'selected' : ''}
	</output>
);
```

`Map.get()` and `Map.has()` track the requested key; `Set.has()` tracks the
requested value. Iteration, `forEach()`, and collection-derived views track
structural changes, while `size` changes only when membership changes.
`Map.set()` and `Set.add()` return the reactive collection, `delete()` returns
whether an entry existed, and `clear()` returns `undefined`, matching native
JavaScript. Adding an existing Set value or setting a Map key to the same value
does not notify consumers.

Maps and Sets cross SSR, hydration, invocation, and continuation boundaries through
tagged JSON envelopes and are reconstructed as real collections. Transported
Map keys must be `null`, booleans, finite numbers, or strings; values and Set
members may use any otherwise transport-safe eXact value. Local-only
collections may still use object keys. A server continuation returns effective
collection mutations as ordered key/value deltas rather than returning the
whole collection. The browser validates every delta against the
compiler-generated write contract before applying any of them.

### Initialization and derived setup values

An assignment with no reactive input is one-time initialization:

```tsx
this.state.page = 1;
this.state.rows = [];
```

A safe initialization expression that reads state, props, or reactive context becomes a
shared, lazy derived value:

```tsx
const subtotal = this.state.quantity * this.state.price;
const total = subtotal + (props.express ? 14 : 0);

return () => <strong>{total}</strong>;
```

The compiler must be able to prove that the initializer is safe to reevaluate. Effectful work
belongs in an interaction or task; an opaque helper needs a valid pure-call contract before it can
participate in an inferred derived relationship.

Its component-body location describes a component-owned relationship. A derived cell caches
one result for all of its DOM, component-prop, list, and task consumers and
uses result equality to stop unchanged values from propagating farther through
the graph. Keep a derived declaration in the component body when several consumers should
share one calculation, non-view work needs it, or an allocation must have one
identity across its consumers.

Generated reactive callbacks sample a retained derived cell once when an
authored expression reads it repeatedly. Consequently, ordinary TypeScript
narrowing remains valid for expressions such as
`point ? point.x : "unavailable"` even though `point` is backed by a reactive
cell. The sample belongs only to that eager callback evaluation; deferred
handlers read the current value when they run.

A returned view is a direct view expression:

```tsx
const label = this.state.online ? `${this.state.name} · online` : this.state.name;
return () => <strong>{label}</strong>;
```

The returned view does not rerun as a unit, so declarations and imperative
control flow belong in the component body. Conditional expressions in JSX and
callbacks owned by keyed branches or items remain region-local and update only
their structural range. This keeps authored ownership unambiguous and prevents
the same view-local calculation from being duplicated across generated
reactive boundaries.

The compiler may elide the runtime cell for an ordinary initialization-derived value
when it is safe to reevaluate, has exactly one eager view consumer, and either
produces a scalar or forwards an existing identity without allocating a new
one. The calculation is fused into that consumer's reactive closure while its
authored declaration remains the inspection definition. A leaf consumer inside a JSX conditional
keeps the calculation in its own closure instead of widening the conditional range's dependency
set. This optimization
does not apply to shared bindings, fresh object or collection identities, task
or event consumers, or values explicitly created with `this.reactive()`.

The same rule applies when the result is assigned to state. The destination is
an output and reads on the right are dependencies:

```tsx
this.state.subtotal = this.state.quantity * this.state.price;
[this.state.tax, this.state.total] = calculateTotals(this.state.subtotal, props.taxRate);
```

Every target in initialization-time reactive destructuring must be a writable state
location so the results can publish as one derived-state transaction. A read
of the same output path would form a feedback cycle and is rejected.

The initial synchronous calculation settles before the component's first render
and before required props are passed to child components. Later dependency
changes publish through the same owned reactive computation.

Use `peek()` to request a deliberate one-time snapshot:

```tsx
this.state.initialCurrency = peek(() => props.currency);
const initialQuery = peek(() => this.state.query);
```

Use a function-defined task instead when the relationship is effectful,
asynchronous, or intentionally feeds back into its own dependencies.

The editor can convert a simple inferred awaited assignment to its explicit
policy form when the compiler proves equivalent placement, readiness,
dependency ordering, cancellation, publication, and diagnostics. It can
simplify an explicit blocking task back to inferred source only when cleanup,
resources, external effects, manual dependency choices, signal use, and control
flow are all reconstructable. These are compiler-planned, version-bound
refactors rather than textual source templates.

### Explicit reactive values

`this.reactive()` creates a component-owned reactive value from a calculation,
a value, or a tagged template. It is the deliberate form when the derived
value itself is an API: it must be passed through another framework boundary,
retain a first-class identity, or remain a durable cell rather than being
eligible for inferred cell elision.

```tsx
const fullName = this.reactive(() => `${this.state.first} ${this.state.last}`);
const status = this.reactive`User: ${fullName}`;
const fixed = this.reactive(42);

return () => <p>{status}</p>;
```

A setup call passes reactive values as ordinary task inputs:

```tsx
function reportFullName(name: string, task: TaskContext = TaskContext.client().latest()) {
	reportName(name, { signal: task.signal });
}

reportFullName(String(fullName));
```

The compiler observes setup-call arguments and reactivates the task when those
inputs change. The task API is the same for component-owned and externally
created `ReactiveValue` instances.

`batch(() => { ... })`, exported by `@exactjs/core`, may group multiple
imperative writes into one reactive publication when an application operation
needs an explicit transaction. Compiler-lowered derived destructuring already
publishes transactionally, and ordinary DOM event callbacks receive the same
transaction boundary automatically. Publication snapshots the affected
subscribers before any of them patch: a consumer that reads several changed
paths still updates once for that synchronous operation, even when its update
replaces the underlying watcher. Interactive consequences are drained before
the DOM callback returns; normal and deferred consequences retain their
scheduled host turns.

## JSX

Native eXact supports intrinsic elements, custom elements, components,
fragments, expressions, spreads, and standard TypeScript JSX type checking:

```tsx
return () => (
	<>
		<section id="profile" {...attributes}>
			<ProfileCard name={this.state.name} />
			<user-avatar display-name={this.state.name} />
		</section>
	</>
);
```

JSX expression positions remain reactive at their owning boundary. This
includes text, children, intrinsic props, component props, styles, classes,
branches, and element choices. A change normally patches that boundary rather
than rerunning the whole component.

### Prop forms

String, expression, boolean, and spread props have their normal TSX spelling:

```tsx
<input name="query" disabled={this.state.busy} required />
<Panel title={this.state.title} {...sharedProps} />
```

eXact also accepts a punned prop, which expands to a same-named prop:

```tsx
const title = 'Compiler';
return () => <article {title} />;
// Equivalent to <article title={title} />.
```

Prop order is preserved. `key` is framework identity and is not passed to a
component as an ordinary prop. `children` is delivered through the component
props contract.

### Fragments

Use the standard fragment syntax when no fragment identity is needed:

```tsx
return () => (
	<>
		<Header />
		<Main />
	</>
);
```

The JSX runtime also exports `_` as a keyed fragment component:

```tsx
import { _ } from '@exactjs/jsx';

return () => (
	<_ key={this.state.section}>
		<Header />
		<Main />
	</_>
);
```

## Enhancement composition

An enhancement is an optional ordinary component around authored output. Namespaced JSX selects a
finite enhancement component, which may wrap, observe, or contribute properties and behavior to
that output. The authored output remains the fallback when the provider is unavailable.

An attributed enhancement is compiled into an explicit `kind: "enhancement"` render-program node
with a preserve-target fallback. The authored namespace is classified once; DOM, SSR, hydration,
and component tests consume that node and never reinterpret the original attribute. Provider
availability belongs to the consuming artifact, so a published component continues to render when
its optional provider package is absent. Installed provider defects are not treated as absence.

An attributed import establishes a local JSX namespace for optional ordinary components supplied
by a component library:

```tsx
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };
import { fade } from '@exactjs/motion/presets';

return () => <ProductCard motion:apply={fade} motion:duration={180} />;
```

The compiler type-checks the finite namespaced props, removes the compile-only import, and emits
canonical component identities and grouped reactive props. Build adapters may link those identities
into the application bundle's enhancement catalog. An available entry mounts as an ordinary,
inspectable component; an unavailable entry leaves the authored output unchanged. Enhancement
metadata and the bundle-local catalog are not framework-plugin discovery or lifecycle.

The provider facade also activates the target renderer's enhancement host. That import is emitted
beside the component module that uses the enhancement, so a statically imported component places
the host in its ordinary bundle while a dynamically imported component or microfrontend carries
the host in its own chunk. Evaluating the later module registers the versioned DOM capability
before its component can mount, including when the owning renderer root already exists. Compatible
independent bundles share the realm registration; applications should still share one eXact runtime
when their bundler or import map supports it.

An enhancement-free client does not include enhancement mounting, routing, reconciliation, or
adoption code. Framework-generated entries activate the host automatically. A low-level integration
that constructs enhancement markers and supplies `enhancementCatalog` manually must import from
`@exactjs/dom/enhanced` or `@exactjs/hydrate/enhanced` so the synchronous renderer is prepared
before it encounters those markers.

Component libraries author the option, while consuming applications decide which providers their
builds use. Enabling a provider constructs the selected enhancement as a normal component. Omitting
or disabling it keeps the authored output and adds no enhancement instance or provider runtime on
that path. Libraries cannot force activation in consuming applications.

For client DOM mounting, a direct intrinsic or `_` fragment chain that declares a provided context
is constructed before that target's descendants. Its contexts are therefore available during
descendant component setup, just as they would be beneath an explicitly authored wrapper component.
Enhancements sharing that target are ordered by their declared context effects; nested targets then
construct within the resulting outer provider chain. Target discovery for a component boundary
remains bounded by that component's materialized output because the semantic target cannot be known
before the component constructs.

The contract is open to third-party packages. Any package can publish ordinary components through
finite `exact-enhancement` exports without a plugin, central registry, special base class, or private
compiler API. Enhancement packages may also contribute bounded language-service completions,
hovers, hints, diagnostics, and safe edits. The intl and accessibility packages use this seam to
explain valid authoring and warn about invalid messages, placeholders, catalogs, ARIA relationships,
focus, names, and composite structure.

An enhancement prop documented with `@exact analyzer-only` is a finite, typed source field for a
trusted analyzer rather than component input. The compiler accepts and type-checks the namespaced
field, exposes it through the ordinary language projection, and removes it from emitted JSX without
selecting or mounting an enhancement component. This generic contract is appropriate for structural
labels and similar compile-time evidence whose meaning belongs to the package analyzer.
It is not reinterpreted as component or intrinsic binding shorthand merely because both features
use namespaced JSX; a genuine collision with an otherwise valid binding receives the ordinary
ambiguity diagnostic.

Ordinary component imports from packages are also resolved at this shared build-host boundary. The
per-module compiler keeps an opaque imported edge conservative until the host validates the
package's inert published component catalog; it does not report the temporary absence of an
in-module contract as a source error. A valid but opaque component-position value lowers to the
[open client-only dynamic boundary](component-registries.md#open-dynamic-fallback) and receives `EXACT2213` unless its
owning declaration uses `@exact dynamic`. Provably invalid values remain errors; the annotation
cannot make them executable.

An attributed namespace export in `exact.config.*` can make the same namespace available to every compiled
component owned by that package:

```ts
export * as intl from '@exactjs/intl/enhancements' with { type: 'exact-enhancement', scope: 'package' };

export default defineConfig({});
```

The namespace export states package-wide availability without pretending the config consumes a
file-local binding, so ordinary unused-import rules need no exception. The configuration loader
records it statically and never executes the enhancement module.
The compiler treats `intl` as a virtual import in each package component, but emits a catalog import
only for modules that actually activate `intl:*`. A top-level declaration or explicit import using
the same local name is a duplicate identifier; rename it or remove the redundant declaration.
`scope: 'package'` is rejected outside `exact.config.*`, and package bindings do not leak into
dependencies or consuming packages.

An enhancement module may attribute named re-exports as finite activators:

```ts
export {
	FadeMotion as fade,
	SlideUpMotion as slideUp
} from './components.js' with { type: 'exact-enhancement' };
```

```tsx
import * as motion from '@exactjs/motion/enhancements'
	with { type: 'exact-enhancement' };

<section motion:fade motion:slide-up={{ distance: 24 }} motion:duration={180} />;
```

Activator presence selects its mapped component. It is selector-only and must be valueless unless
that component declares the matching camel-case prop; a declared activator prop receives `true` for
a valueless attribute or the authored payload. Remaining props are distributed to every selected
component that declares them. Aliases resolving to one canonical component produce one instance and
one complete grouped prop object. Named activators suppress an implicit default component; a mapped
namespace without a default requires an activator.

The framework `_` fragment is also a direct enhancement boundary. Its active enhancement chain
occupies the fragment boundary and may produce text or several nodes without finding an intrinsic
root. If the enhancement is unavailable, the authored children remain the fallback.

### Semantic targets

`<_target>` is an ordinary transparent component-language boundary. It requires children, emits no
DOM of its own, and lets any component contribute properties to and export one semantic intrinsic
target while still rendering surrounding structure:

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

The same form works when `Field` is invoked explicitly or selected as an enhancement. A component
may wrap, replace, or otherwise compose its children around `_target`; omitting children is a
compiler diagnostic. Nested target boundaries contribute independently to the same intrinsic.
Authored singular props take precedence, followed by the nearest contribution; `undefined` falls
through and `null` explicitly suppresses a lower value. Classes and token-list attributes are
deduplicated, styles merge per property, refs fan out, and event subscriptions preserve intrinsic
then inner-to-outer ordering. Compiler-owned native-control bindings remain attached verbatim while
target layers contribute presentation or behavior, so enhancing a bound input or select cannot
interpose on its state publication. Reactive contributions update without changing the authored VNode.
Framework-owned projections may explicitly mark a finite scalar contribution as replacing its
authored fallback while that projection is active. This marker is runtime metadata, not `_target`
authoring syntax; ordinary authored target layers retain the precedence above.

### Bounded target routing

An enhancement written on an intrinsic targets that intrinsic immediately. One written on `_`
uses the fragment boundary directly. A component declaration first consumes a propagated
`_target`; otherwise it follows only the component's selected logical output path until it finds the
first intrinsic or the first nested component frame that already owns a root. After such a frame is
selected, later siblings and alternate nested component output are not searched for another root.
A pass-through component returning `props.children` contributes no new frame, so the projected
children remain in the receiving logical output frame.

Conditional output resolves only the active branch. Structural changes may attach a previously
dormant `_target` contribution or move an enhancement to a new target generation, releasing the old
attachment first. The reserved `namespace:root` selector is restricted to that same bounded frame;
it cannot redirect an enhancement authored directly on an intrinsic. DOM rendering, SSR, hydration,
and component testing use the same routing contract.

### Portable build metadata

Enhancement composition does not introduce a plugin manifest or a second component registry. For
each compiled module, the compiler's existing portable analysis is the complete compiler-provided
input for build adapters:

- `packageName` identifies the package boundary supplied by the build integration;
- `components` records canonical component IDs, inferred placement, environment effects, and the
  client/server artifact targets that can contain each component;
- `partitionPlan` records component ownership and actual client/server reachability through the
  compiled output graph; and
- `rendererEnhancements` records each selected canonical enhancement identity together with its
  module specifier and export name for bundle-local catalog linking.

The fields are data-only and safe to pass between the compiler host and build integrations. They
do not say that a package is trusted, inspect `@exactjs/component-library`, read application policy,
or authorize execution. A server-executing bundler combines this semantic output with its own
resolved module and package graph. The bundler is the only authority for package provenance and
component-library trust; compiler and language-service diagnostics do not approximate that policy.

### Events

DOM events use `onName` and capture events use `onNameCapture`:

```tsx
<form
	onSubmit={(event) => {
		event.preventDefault();
		save();
	}}
>
	<input
		onInput={(event) => {
			this.state.query = event.currentTarget.value;
		}}
	/>
</form>
```

The JSX types specialize `event.currentTarget` for the intrinsic element, so a
manual event cast is normally unnecessary. Event handlers are owned by the
element and are released when it is removed. The server artifact omits
client-only handlers; the compiler emits the matching client activation
boundary.

State writes made by a native event handler are published as one reactive update group. If a later
statement throws, writes already made remain observable, matching ordinary JavaScript event
semantics. Wrap a region in `batch()` when that region specifically requires synchronous rollback
on failure.

### Classes

`className` is the authored property. The DOM and SSR render it as the HTML
`class` attribute. Its value may be a string, nested arrays, truthy-key maps,
or reactive values:

```tsx
<article className="card featured" />
<article className={`card featured theme-${props.theme}`} />

<div
	className={[
		'card',
		`theme-${this.state.theme}`,
		{ selected: this.state.selected, disabled: this.state.disabled }
	]}
/>
```

Use `className:name` when the token is static and its condition is dynamic:

```tsx
<article
	className="card"
	className:selected={this.state.selected}
	className:is-compact={props.compact}
	className:always
/>
```

Each truthy namespaced value contributes its suffix. Contributions are
combined in authored prop order, and the namespaced props do not reach the
DOM. Dynamic duplicate tokens are retained. The compiler reports a duplicate
only when it can prove the same token is already present.

`className:name` is supported on intrinsic and custom elements, not component
props. It cannot currently be combined with a prop spread. When it is present,
use `className`, not `class`, for the ordinary class contribution.

### Styles

`style` accepts a CSS string or an object. Object property names may be
camel-cased CSS properties or custom properties:

```tsx
<div
	style={{
		backgroundColor: this.state.color,
		opacity: this.state.visible ? 1 : 0,
		'--panel-width': `${this.state.width}px`
	}}
/>
```

Each reactive style entry updates independently. Unit helpers such as `px()`,
`rem()`, `percent()`, and `ms()` are exported by `@exactjs/dom` when an
explicit reactive CSS value is useful.

### Component value/callback bindings

A component can pair an ordinary value prop with an ordinary notification callback when the
callback's first argument is a replacement value:

```tsx
<SettingsPanel expanded:onExpandedChanged={this.state.settingsExpanded} />
```

This is exactly shorthand for a reactive `expanded` prop and an ordinary `onExpandedChanged`
callback prop that assigns its first argument to `this.state.settingsExpanded`. Both sides of the
colon are ordinary names from the child component's finite prop type. The parent retains ownership
of the writable state location; the child receives an immutable value and a callback. The callback
must return only `void` or `undefined`. Additional callback arguments are allowed and ignored.

The parent remains the state owner and the child still receives immutable props. Write the two
props explicitly when the callback must validate, refuse, transform, log, await, or return a
meaningful result. Supplying either generated prop explicitly is a duplicate-prop error; the
compiler never composes component callbacks.

The compiler resolves component bindings alongside attributed enhancement namespaces. If both
interpretations are valid, compilation fails and the source must expand the component props or
rename the enhancement import namespace. Custom elements do not gain this convention, and
`_target` remains intrinsic contribution syntax rather than a component binding boundary.
The public JSX declarations admit namespaced source syntax, while `exactc --check` validates the
finite pair and then runs TypeScript semantic checking against the lowered representation. Raw
`tsc --noEmit` sees the authored namespaced attribute rather than the two compiler-generated props
and is therefore not the application type-check command for compiler-owned TSX syntax.

### Intrinsic bindings

Five compiler-owned namespaced props provide two-way bindings to one writable
reactive location:

```tsx
<input value:onInput={this.state.name} />
<input type="number" value:onChange={this.state.quantity} />
<input type="date" value:onChange={this.state.date} />
<input type="checkbox" checked:onChange={this.state.subscribed} />
<input type="radio" value="ground" checked:onChange={this.state.delivery} />
<input type="checkbox" value="ups" checked:onChange={this.state.carriers} />
<select multiple value:onChange={this.state.tags}>...</select>
<details open:onToggle={this.state.advanced}>Advanced settings</details>
<dialog modal:isOpen={this.state.settingsOpen}>Settings</dialog>
```

The supported combinations are:

| Syntax             | Controls                                         | State value                                                         |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------- |
| `value:onInput`    | `input`, `textarea`                              | string, number, `Date`, or a nullable variant                       |
| `value:onChange`   | `input`, `textarea`, `select`, `select multiple` | scalar value, or a homogeneous string/number array for multi-select |
| `checked:onChange` | checkbox or radio `input`                        | boolean, the radio value, or a homogeneous string/number array      |
| `open:onToggle`    | `details`                                        | boolean disclosure state                                            |
| `modal:isOpen`     | `dialog`                                         | boolean native modal state                                          |

Select controls always commit on `change`. Boolean state requires
`type="checkbox"`. A `Date` requires `type="date"`. An array-bound checkbox
requires an explicit `value`, and an array is otherwise valid only for
`<select multiple>`. Controlled select values are applied after their option values, including in
compiler-planned static regions, so the declared value is selected on the initial mount. Native
SSR also serializes that selection onto the matching options. Hydration can therefore distinguish
a pristine server-rendered select from a selection the user changed before activation and preserves
only the latter as browser-owned state.

The binding generates the corresponding `value`, `checked`, or `open` prop, so that prop
cannot also be written explicitly. An authored handler for the same event is
allowed and runs after state has been updated:

```tsx
<input
	value:onInput={this.state.name}
	onInput={() => this.log.info('edited', { name: this.state.name })}
/>
```

`details` publishes the final `open` property observed at `toggle`. In a named exclusive group,
each member that the browser changes publishes its own final value, and an agreeing state update
does not write the property back. A disclosure changed before hydration is treated like a dirty
form control: hydration preserves the live value and publishes it before normal reactive updates.

`modal:isOpen` owns only native modal state. A committed true value calls `showModal()`, false calls
`close()`, and native `toggle` or `close` completion publishes the final `:modal` state. It cannot
be combined with `open`: serialized `open` is nonmodal and cannot represent browser top-layer
state. SSR therefore omits modal state, while hydration adopts a dialog opened before hydration
and publishes that state before normal writes. Disposal removes binding listeners without closing
the dialog. An already-open nonmodal dialog is an ownership conflict rather than something the
binding silently converts.

JSX also types the native button command surface used with dialogs and popovers:

```tsx
<button commandFor="settings" command="show-modal">Settings</button>
<button commandFor="settings" command="request-close">Cancel</button>
```

The finite values are `show-modal`, `close`, `request-close`, `show-popover`, `hide-popover`, and
`toggle-popover`. These are native attributes, not eXact event aliases. A package language provider
such as `@exactjs/accessibility` may validate statically resolvable command targets without adding
package semantics to the compiler.

Bindings observe only their declared browser endpoint. Reset, autofill, restoration, or another
platform mutation updates state when the browser dispatches that endpoint; eXact does not synthesize
events, poll controls, or install document-wide mutation observers. Use explicit coordination when
a platform behavior does not dispatch the selected event.

Use an ordinary controlled element when conversion or write-back is more
complex:

```tsx
<input
	value={this.state.name}
	onInput={(event) => {
		this.state.name = normalizeName(event.currentTarget.value);
	}}
/>
```

### Refs

Create a typed key outside the component, create an instance-owned binding
in the component body, and attach it with `ref`:

```tsx
const searchInput = createRef<HTMLInputElement>('search input');

function Search(this: Component<{}>) {
	const input = this.ref(searchInput);

	this.onMount(() => {
		this.refs.get(searchInput)?.focus();
	});

	return () => <input ref={input} />;
}
```

`this.ref(key)` returns one stable component-owned binding for that key.
`binding.current` and the registry's `this.refs.get(key)` read the same reactive
slot, returning `undefined` before fulfillment and after removal. Refs follow
element ownership through updates, hydration, and `Activity` parking. Calling
`fulfill()` directly remains ordinary imperative ref assignment; it does not
claim DOM ownership or structural lifecycle behavior.

`this.refs.root()` returns a stable reactive view of the component's first
intrinsic root. Its `current`, `generation`, `introduction`, and `presented`
fields follow root replacement and retained `Activity` ranges. `introduction`
is `initial`, `hydration`, or `update` for the current generation and survives
an exact release reversal. Pass an element-valued binding to
`this.refs.root(binding)` when that ref, rather than the first intrinsic output,
defines the component root. The binding must belong to the same component.

Before a renderer-owned root generation is structurally removed or replaced,
`release` publishes its retained target, generation, presentation state, and a
namespaced structural reason. Tasks activated synchronously from that release
join one renderer release frame. After those observers attach, the retained
component subtree deactivates while physical removal waits for task descendants
and cleanup. Reconciliation can reverse an in-flight release only for the exact
retained identity and generation; it cancels stale release work and reactivates
the same instances. Root shutdown cancels outstanding release work and completes
removal immediately. Direct `fulfill()` calls remain ordinary ref assignment and
never acquire structural retention.

### Keyed collections

An ordinary reactive `Array.map()` is compiled as a keyed collection when
identity is available from a type annotation. The annotation may live beside
the component or on an item type imported from another module:

```tsx
type Todo = {
	/** @exact key */
	id: string;
	text: string;
};

return () => (
	<ul>
		{this.state.todos.map((todo) => (
			<li>{todo.text}</li>
		))}
	</ul>
);
```

Use `@exact key=fieldName` when the identity field has a different declaration
site, or put `key` on the rendered vnode:

```tsx
return () => (
	<ul>
		{this.state.todos.map((todo) => (
			<TodoRow key={todo.externalId} todo={todo} />
		))}
	</ul>
);
```

Use `this.map()` when an explicit selector is clearer or the item type cannot
carry the annotation:

```tsx
return () =>
	this.map(
		this.state.todos,
		(todo) => todo.externalId,
		(todo) => <TodoRow todo={todo} />
	);
```

Keys must be stable and unique among siblings. They preserve component
instances, DOM nodes, form values, refs, and local state across insertion,
removal, and reordering. Array indexes are appropriate only when position
really is the item's identity. Inferred keyed lowering applies only when the
map produces JSX children; ordinary data transformations keep native
`Array.map()` semantics even when their item type has an `@exact key` field.

### Portals

`createPortal()` keeps children under their logical component owner while
placing their DOM in another renderer container:

```tsx
function Dialog(this: Component<{}>, props: { target: Element }) {
	return () =>
		createPortal(
			props.target,
			<div role="dialog">
				<DialogContents />
			</div>
		);
}
```

Context, events, lifecycle, unmounting, and `Activity` ownership follow the
logical tree, not the physical DOM parent.

### Unsafe HTML

Normal JSX text and attributes are escaped. Deliberately raw markup requires
`unsafeHtml()`:

```tsx
return () => <article>{unsafeHtml(auditedMarkup)}</article>;
```

Native DOM, SSR, and hydration roots reject it unless the application opts in
with `allowUnsafeHtml: true`. `dangerouslySetInnerHTML` is not supported.
`iframe.srcdoc` likewise requires an `unsafeHtml()` value and root opt-in.
Compiled calls select the DOM unsafe-HTML renderer in the module that uses the
capability, so an application without such a call omits the range parser and
binding implementation. Framework code that deliberately constructs the
internal VNode operation at runtime must import `@exactjs/dom/unsafe-html`
explicitly.

## Tasks

An ordinary local function becomes a task when the compiler finds task policy,
task capabilities, placement-sensitive effects, or a known activation host.
Calling it in the component body declares component-owned work:

```tsx
function Search(this: Component<SearchState>) {
	async function runSearch(query: string, task: TaskContext = TaskContext.client().latest()) {
		const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
		this.state.results = await response.json();
	}

	runSearch(this.state.query);

	return () => <Results items={this.state.results} />;
}
```

The local definition may equivalently be a function expression or arrow and
may use the full ordinary TypeScript parameter surface. Defaults are evaluated
at generation invocation time; a default reading `this.state` observes the
current value rather than a construction-time snapshot.

Setup-call arguments, plus state, prop, and reactive-context reads in task
work, are inferred as dependencies. Assignments are effects, not dependencies.
With the default setup concurrency of `latest`, each dependency change aborts
the previous generation and starts a new one. The compiler supplies the
generation's `AbortSignal` to known cancellable APIs and through an optional
final `TaskContext` parameter:

```tsx
async function searchPage(
	query: string,
	page: number,
	task: TaskContext = TaskContext.client().latest()
) {
	this.state.results = await search(query, page, { signal: task.signal });
}

searchPage(this.state.query, this.state.page);
```

When a reactive value should be sampled for each generation but should not
schedule one, put it in a defaulted non-context parameter:

```tsx
async function searchPage(
	query: string,
	filters: SearchFilters = this.state.filters,
	task: TaskContext = TaskContext.client().latest()
) {
	this.state.results = await search(query, filters, { signal: task.signal });
}

searchPage(this.state.query);
```

The query argument is tracked. The omitted filters default is captured once
when that generation begins and then behaves as an ordinary value. Supplying a
filters argument explicitly restores normal call-site tracking.

Register cleanup explicitly on the generation:

```tsx
function observeChannel(task: TaskContext = TaskContext.client()) {
	const channel = openChannel({ signal: task.signal });
	task.cleanup(() => channel.close());
}

observeChannel();
```

The compiler also recognizes common owned resources, including event
listeners, fetches, timers, observers, sockets, and subscription results, and
connects their cancellation or disposal to the task generation. Use
`task.cleanup()` for an opaque cleanup callback and `task.own()` for a
`Disposable` or `AsyncDisposable`.

An async component may await a task result directly into state when an explicit
task boundary is wanted around value-producing work:

```tsx
async function ShippingOptions(this: Component<ShippingState>) {
	this.state.options = await getOptions(this.state.destination);

	return () => <Options options={this.state.options} />;
}
```

The compiler lowers this to a repeatable blocking task whose result is staged
into the assignment target. The assignment target must be a statically
transportable state path when the task runs on the server.

Explicit task policy is a chain on the final context default:

```tsx
function install(task: TaskContext = TaskContext.client()) {
	installBrowserIntegration();
}
function warm(task: TaskContext = TaskContext.server().deferred()) {
	warmServerCache();
}
async function load(task: TaskContext = TaskContext.server().blocking()) {
	this.state.catalog = await loadCatalog();
}

install();
warm();
load();
```

- `client()` and `server()` request placement;
- `immediate()`, `normal()`, and `deferred()` select scheduling priority;
- `blocking()` and `nonblocking()` select readiness; and
- `parallel()`, `latest()`, and `queue()` select owner-local concurrency.

A blocking generation participates in the nearest `Suspense` readiness
boundary. Placement, concurrency, priority, readiness, and attachment are
independent. Contradictory or repeated policy is an error. Explicit placement
may not contradict known browser-only or server-only effects.

Call initialization-activated tasks directly in the component body, not inside render functions.
Calls inside other task functions are invoked child generations and attach to
the active task frame automatically. Use task policy for external effects,
cleanup, nonblocking work, manual scheduling/readiness, concurrency, or opaque
placement. Pure derived assignment does not need a task.

## Async components and continuations

An authored component may be `async` when awaited results flow into component
state:

```tsx
async function ShippingOptions(this: Component<ShippingState>) {
	this.state.options = await getOptions(this.state.destination);
	return () => <Options options={this.state.options} />;
}
```

The compiler lowers this to synchronous setup plus an owned, restartable,
blocking continuation. Reactive reads before an await become dependencies.
Known cancellable calls receive the generation signal. State writes are staged
and publish only after the complete generation succeeds.

Sequential awaits and ordinary control flow are supported:

```tsx
async function CustomerOrders(this: Component<CustomerState>) {
	try {
		const customer = await loadCustomer(this.state.customerId);
		const orders = await loadOrders(customer.id);
		[this.state.customer, this.state.orders] = [customer, orders];
	} catch (error) {
		this.state.error = normalizeError(error);
	} finally {
		recordAttempt();
	}

	return () => <Orders state={this.state} />;
}
```

Framework cancellation bypasses authored catches so an obsolete generation
cannot publish an application fallback; `finally` still runs for cleanup.

Values needed by the final render function must be written to `this.state`.
Continuation-local values may not escape into render before settlement, and an
async branch may not choose among different render functions. Return one final
synchronous render function.

For a client/server continuation, captured inputs and returned effects must
have statically known, serializable contracts. A dynamic write such as
`this.state.rows[index].value = next` is valid in client-local work but cannot
be transported as a continuation effect. Publish an enclosing static state
path instead:

```tsx
this.state.rows = updateRow(this.state.rows, index, next);
```

Statically addressed Map and Set mutations are transportable effects. The
dynamic key or value is payload, not a state path, so only the changed entry is
returned:

```tsx
async function refreshProduct(task: TaskContext = TaskContext.server()) {
	const product = await loadProduct(this.state.productId, { signal: task.signal });
	this.state.products.set(product.id, product);
	this.state.visibleIds.add(product.id);
}

refreshProduct();
```

Map keys used across this boundary must use the scalar key types listed in the
State section.

Use explicit `TaskContext` policy for external effects, cleanup, deliberately
nonblocking work, or manual placement and scheduling.

## Interactions, tasks, and optimistic state

DOM events and framework-owned form callbacks run in a component interaction. The interaction
owns asynchronous settlement, cancellation, error routing, scheduling priority, and work joined
by the router. Ordinary callbacks remain the default:

```tsx
async function save(_event: SubmitEvent, data: FormData) {
	this.state.profile = await profiles.save(readProfile(data));
}

return () => <Form onValidSubmit={save}>...</Form>;
```

Add task policy when work needs inspectable status, direct invocation,
placement, concurrency, deferred priority, or optimistic state:

```tsx
async function save(profile: Profile, task: TaskContext = TaskContext.server().latest()) {
	task.optimistic(() => {
		this.state.profile = profile;
	});
	this.state.profile = await profiles.save(profile, { signal: task.signal });
}
```

Task functions have compiler-synthetic reactive `pending`, `pendingCount`,
`generation`, `result`, and `error` properties plus `cancel()`. Ordinary
TypeScript libraries use the equivalent `taskStatus()` or `bindTask()` ABI.
Optimistic blocks require `latest()` or `queue()`, run synchronously, and may
use ordinary deep object, array, `Map`, and `Set` mutations. Failure,
cancellation, supersession, and unmount remove every owned overlay while
preserving newer authoritative writes.

Server tasks use compiler-generated opaque operation identity; the authored
function name is diagnostic only.

## Error boundaries, Suspense, and Activity

`ErrorBoundary` captures failures from descendant construction, rendering, events, lifecycle,
reactive work, and component tasks. Its default fallback reports the captured errors and provides
a retry button that remounts the failed subtree:

```tsx
import { ErrorBoundary } from '@exactjs/core';

function AppShell() {
	return () => (
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	);
}
```

Pass a fallback function for application-specific presentation. It receives the latest report,
all reports captured since the last reset, and the reset operation:

```tsx
<ErrorBoundary
	fallback={({ error, reset }) => (
		<section role="alert">
			<p>{String(error.error)}</p>
			<button onClick={reset}>Return to the app</button>
		</section>
	)}
>
	<Workspace />
</ErrorBoundary>
```

An error thrown by the boundary or its fallback proceeds to the next enclosing boundary. Use the
lower-level `ErrorContext` and `createErrorContext()` when capture, reporting, or reset behavior
must differ; ordinary application recovery should prefer the built-in component.

Application-created error contexts retain their full authored history until the application clears
it. Only the process-global fallback context is framework-bounded: it keeps the newest 100 reports
so an unattached failure path cannot retain an unlimited process history. Attaching or detaching
inspection does not replay or retain reports outside the owning context.

`Suspense` waits for descendant blocking task generations:

```tsx
return () => (
	<Suspense fallback={<ShippingSkeleton />}>
		<ShippingOptions />
	</Suspense>
);
```

On first mount the fallback remains until the candidate is ready. On later
updates, committed content remains visible while the next candidate prepares.
Nested boundaries own independent generations.

The compiler selects the coordinated Activity/Suspense DOM implementation only
for modules that author one of these native boundaries. This remains correct for
lazy chunks and microfrontends because the importing module carries the
registration. Framework code that deliberately constructs these internal VNode
operations at runtime must import `@exactjs/dom/structural-boundaries`
explicitly.

`Activity` retains a mounted subtree while changing its connectivity and work
policy:

```tsx
return () => (
	<>
		<Activity mode={this.state.tab === 'editor' ? 'active' : 'parked'}>
			<Editor />
		</Activity>
		<Activity mode={this.state.tab === 'preview' ? 'active' : 'background'}>
			<Preview />
		</Activity>
	</>
);
```

Its modes are:

| Mode         | DOM                             | Reactive work |
| ------------ | ------------------------------- | ------------- |
| `active`     | connected                       | normal        |
| `parked`     | retained in a detached fragment | paused        |
| `background` | retained in a detached fragment | deferred      |

Parking preserves component instances, DOM nodes, form values, refs, handlers,
nested boundaries, and logically owned portal output. It is not unmounting.

## Context

Create a typed token at module scope:

```tsx
const ThemeContext = createContext<Theme>('theme');
```

Publish a component-scoped value for descendants and read the nearest value:

```tsx
function ThemeProvider(this: Component<{}>, props: { children?: Child | Child[] }) {
	this.setContext(ThemeContext, {
		accent: 'teal',
		density: 'comfortable'
	});
	return () => props.children;
}

function Toolbar(this: Component<{}>) {
	const theme = this.getContext(ThemeContext);
	return () => <nav style={{ color: theme.accent }}>...</nav>;
}
```

Reactive context values are proxied and their reads participate in dependency
tracking. Use `reactive: false` for an opaque service or class instance:

```tsx
const RepositoryContext = createContext<Repository>('repository', {
	reactive: false
});
```

Use `this.hasContext(token)` before lookup when a provider is optional.
`this.getContext()` intentionally throws when no value or framework default is
available.

Context token options are:

```tsx
createContext<Value>('name', {
	global: false,
	reactive: true,
	keep: 'shared',
	scope: 'component'
});
```

- `global` uses global symbol identity so separately bundled code can share the
  token;
- `reactive` controls whether the value is made reactive;
- `keep` is `server`, `client`, `shared`, or `secret`; and
- `scope` is `component`, `application`, or `request`.

Application and request scopes describe server-runtime provisioning.
`this.setContext()` always publishes with component-tree lifetime; it does not
promote a value to application or request lifetime.

## Lifecycle, refs, and logging

Lifecycle handlers are declared in the component body:

```tsx
this.onMount(({ signal }) => {
	connect({ signal });
});

this.onActivate(({ signal }) => {
	resumeConnection({ signal });
});

this.onDeactivate(({ reason }) => {
	pauseConnection(reason);
});

this.onUnmount(({ reason }) => {
	release(reason);
});

this.onRender(({ duration, dependencies }) => {
	this.log.debug('rendered', { duration, dependencies });
});
```

- `onMount` runs after the instance is mounted;
- `onActivate` runs when a retained instance becomes connected;
- `onDeactivate` runs when it is parked or otherwise disconnected;
- `onUnmount` is final disposal; and
- `onRender` observes render duration and, when available, dependencies.

Mount and activation handlers receive an `AbortSignal`. Lifecycle return values
are observed when promise-like; ordinary return values are ignored.
Canonical mount, activate, and deactivate handlers belong to client activation and are not
evaluated by the server artifact. `onRender`, `onUnmount`, and `own` retain server semantics where
SSR rendering or request cleanup can exercise them.
Task cleanup remains the preferred owner for resources acquired by a task.
Use `this.own(resource)` for a disposable value created during component setup
that must live until the durable component instance is unmounted. It returns
the same value and accepts `dispose()`, `Symbol.dispose`, or
`Symbol.asyncDispose`; the compiler records component ownership instead of
forcing the resource into a shorter task lifetime.

`this.log` is the component-scoped logger. It follows the nearest logger
context and adds component identity to structured log records. Write ordinary
calls such as `this.log.debug('loaded', { id, record })`: the compiler lowers
canonical `this.log.trace()`, `debug()`, `info()`, `warn()`, and `error()` calls
so the logger's runtime enablement check happens before any argument expression
is evaluated. Disabled calls therefore do not build message templates, payload
objects, or errors, and do not require authored lazy callbacks.

When the level is enabled, the runtime evaluates the complete argument list
inside `peek()`. Reactive values are read at the time of the log call without
turning diagnostic observation into a render, effect, or task dependency. The
compiler treats that complete argument region as the same observational
boundary; it does not synthesize a derived computation for the logging
expression.

Logging is never erased according to build mode. The same artifact can enable a
level later through its logger context, and the next call observes that change.
Calls through aliases, computed properties, or another object's logger are left
as ordinary TypeScript; use lazy log values there when deferred evaluation is
required.

## Placement and data-policy annotations

The compiler infers browser, server, shared, and secret effects whenever it can.
Use annotations to state facts that cannot be recovered from an opaque API or
to define a public data contract:

```tsx
/** @exact client */
function readViewport() {
	return window.innerWidth;
}

/** @exact server */
async function loadPrivateRecord() {
	return database.record.findFirst();
}

interface ProductRepository {
	/** @exact shared */
	find(id: string): Promise<{ id: string; name: string }>;
}

/** @exact keep=secret */
const credential = loadCredential();

/** @exact pure */
function formatLabel(value: string) {
	return value.trim().toUpperCase();
}
```

Core annotations are:

| Directive                                 | Meaning                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `@exact key` or `@exact key=field`        | declares stable collection identity                                          |
| `@exact client`                           | declares a client effect or client-only callable                             |
| `@exact server`                           | declares a server effect or server-only callable                             |
| `@exact shared`                           | authorizes the annotated plain result contract to cross a placement boundary |
| `@exact keep=client`                      | retains the annotated value on the client                                    |
| `@exact keep=server`                      | retains the annotated value on the server                                    |
| `@exact keep=secret`                      | marks the value and its derivations secret and server-only                   |
| `@exact pure`                             | declares an otherwise opaque callable deterministic and effect-free          |
| `@exact cleanup` or `@exact cleanup=name` | identifies an opaque cleanup/disposal method, optionally by name             |
| `@exact own`                              | declares that the receiving scope owns an opaque returned resource           |
| `@exact track`                            | identifies a callback parameter whose reactive reads must be tracked         |

Annotations are checked rather than blindly trusted. A client declaration
cannot make a server-only import browser-safe, `@exact shared` cannot release a
secret, and serializable data is not automatically public.

The directive set is compiler-owned and finite. Namespaced forms such as
`@exact namespace.directive` are diagnostics; plugins do not register compiler
directives or transforms.

## Unsupported or diagnostic forms

The compiler reports an error instead of emitting a partial approximation when
it cannot preserve both JavaScript behavior and eXact's reactive, ownership, or
transport contract. Important examples are:

- declarations, statement control flow, state writes, lifecycle registration,
  scheduling, and known external effects inside a returned view;
- a module-level shared or bound callable returned as a component view;
- setup task activation inside a render body or through an unanalyzable call;
- reassigned component values, mutable component dictionaries, or registry selection not proven
  by `KeyOf` or `hasComponent()`;
- direct task invocation during render, escaping `TaskContext`, asynchronous
  optimistic callbacks, or optimistic parallel tasks;
- reflective state mutation and state targets in `for-in` or `for-of`;
- a setup derived-state cycle without `peek()` or an explicit task;
- a derived setup destructuring target that is not component state;
- a form binding that is not one writable location or does not match its
  control and state type;
- `className:name` on a component, beside a prop spread, beside `class`, or
  duplicating a statically known token;
- an async local escaping into render or an async branch selecting the render
  function;
- a dynamic computed state effect crossing a server continuation;
- contradictory placement, a non-serializable continuation capture, or secret
  data reaching client state, public HTML, hydration data, or a public error;
  and
- `dangerouslySetInnerHTML` or unapproved `unsafeHtml()`.

These restrictions are boundaries of the current supported language, not
instructions to reproduce compiler or transport machinery in application
code. Prefer ordinary TypeScript that makes ownership, identity, and
client/server intent statically clear.
