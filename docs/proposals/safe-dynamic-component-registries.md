# Safe dynamic and lazy component registries

## Status

Implemented for finite native eXact registries, including:

- registry identity and display names are inferred from an immutable
  module-level binding;
- `createComponentRegistry()` receives a definition callback with a scoped
  `lazy` capability;
- the callback's returned object defines the complete key and component type
  map;
- static entries may be rendered with JSX member syntax such as
  `<Widget.grid />`;
- reactive finite selection uses ordinary indexed access such as
  `Widget[this.state.widget]`; and
- `KeyOf<typeof Widget>` derives application key types from the registry
  without duplicating string unions.

The runtime provides frozen branded definitions, key-specific identity, lazy
load deduplication/retry, correlated heterogeneous selection, preload and
inspection helpers. The compiler emits opaque registry identities, diagnostics,
entry provenance, placement/artifact metadata, and explain output. SSR and
hydration retain registry/key identity in component markers and recover a
mismatched entry inside its owned range.

| Delivery area                                                        | Current status |
| -------------------------------------------------------------------- | -------------- |
| Immutable eager registries and stable key facades                    | Implemented    |
| Reactive finite selection and key narrowing                          | Implemented    |
| Heterogeneous props and `ComponentSelection`                         | Implemented    |
| Lazy loading, deduplication, retry, preload, and generation fencing  | Implemented    |
| Compiler diagnostics, opaque identities, contracts, and explanations | Implemented    |
| Placement-aware client/server artifact planning                      | Implemented    |
| SSR, Suspense, hydration identity, and range-local mismatch recovery | Implemented    |
| Immutable runtime inspection                                         | Implemented    |
| Automatic ownership inference for unbranded React values             | Deferred       |
| Additional production graph enforcement and remote registries        | Deferred       |

Automatic React ownership classification, target-specific production graph
verification beyond the current bundler contracts, and independently deployed
remote registries remain outside this implementation. React values must pass
through the existing explicit compatibility adapter when ownership is not an
eXact component contract.

Current authoring behavior is documented in
[`../component-registries.md`](../component-registries.md) and
[`../component-language.md`](../component-language.md). This document remains
as the design rationale and extended verification inventory; future-tense
delivery sections below record the original plan and are not a claim that
implemented phases remain pending.

## Decision

Introduce a compiler-owned, immutable component registry:

```tsx
const Widget = createComponentRegistry(({ lazy }) => ({
	grid: GridWidget,

	table: lazy(() => import('./TableWidget.js').then(({ TableWidget }) => TableWidget))
}));
```

The registry binding is the source of its authored display name. The compiler
derives stable internal identity from the module and declaration symbol rather
than accepting a duplicate string parameter.

The public result behaves as a readonly component map:

```tsx
<Widget.grid project={props.project} />;

const CurrentWidget = Widget[this.state.widget];
return <CurrentWidget project={props.project} />;
```

The scoped `lazy()` helper returns a registry-definition descriptor, but the
corresponding public property is typed as the component it resolves:

```ts
type TableComponent = typeof Widget.table;
// typeof TableWidget
```

The registry is a finite compiler contract, not a mutable service locator.
Runtime extension, remote discovery, and independently deployed components
remain responsibilities of plugins and microfrontends.

## Why this belongs in eXact

The compiler currently rejects:

```tsx
const views = {
	grid: Grid,
	list: List
};

const View = views[this.state.kind];
return () => <View />;
```

The lookup hides facts required by compilation:

- the complete terminal component set;
- client, server, and isomorphic placement;
- component prop contracts;
- lazy chunk and asset reachability;
- SSR and hydration identity;
- client-island and server-slot boundaries;
- reachable server continuations; and
- React compatibility ownership.

A component registry makes those facts explicit while preserving familiar
TypeScript lookup and JSX syntax. The dynamic value remains an ordinary key;
the compiler owns the generated selection, loading, placement, hydration, and
authority machinery.

## Goals

- Allow runtime component selection from a statically finite component set.
- Preserve ordinary property access, indexed access, immutable aliases, and
  JSX member expressions.
- Infer registry keys and resolved component types from one definition.
- Avoid manually repeated string unions when entries are added or removed.
- Support eager and lazy entries in one registry.
- Preserve per-entry prop checking.
- Preserve setup-once component instances when the selected key is unchanged.
- Replace only the registry-owned mounted range when the key changes.
- Integrate lazy selection with Suspense, ErrorBoundary, Activity, SSR,
  hydration, and interaction activation.
- Preserve per-entry client/server placement and server operation allowlisting.
- Preserve entry-level tree shaking, code splitting, CSS, and asset ownership.
- Support compiled library registries without persisted compiler-analysis
  sidecars.
- Retain explicit React compatibility ownership at mixed boundaries.

## Non-goals

- Mutable runtime registration.
- Arbitrary component functions received from application data.
- Dynamic import paths derived from runtime strings.
- A general `createVNode()` escape from placement analysis.
- Automatic preservation of every previously selected component instance.
- Treating registry keys as server operation identifiers.
- Guessing React ownership from package names or runtime function shape.
- Automatically preloading every registry entry.
- Hiding load failures by rendering nothing.
- Supporting lazy components outside registries in the first delivery.
- Using a registry as a replacement for trusted microfrontend deployment.

## Authoring model

### Registry definition

A registry is declared as an immutable module-level binding:

```tsx
const Widget = createComponentRegistry(({ lazy }) => ({
	grid: GridWidget,
	table: lazy(loadTableWidget),
	metric: MetricWidget
}));
```

The definition callback establishes a compiler-owned declarative scope.
`lazy` is available only in that scope and cannot escape it.

An eager-only registry uses the same shape:

```tsx
const Report = createComponentRegistry(() => ({
	summary: SummaryReport,
	activity: ActivityReport
}));
```

### Inferred name and identity

For:

```tsx
const Widget = createComponentRegistry(() => ({
	grid: GridWidget
}));
```

the compiler records:

```text
display name: Widget
identity: source module identity + declaration symbol
```

The binding name is used for explain output, logging, profiling, errors, and
inspection. It is not used for server dispatch or security.

Anonymous default exports are rejected:

```tsx
// Diagnostic: component registries require a named module-level binding.
export default createComponentRegistry(() => ({
	grid: GridWidget
}));
```

Use:

```tsx
const Widget = createComponentRegistry(() => ({
	grid: GridWidget
}));

export default Widget;
```

An export alias does not change the underlying registry identity:

```tsx
export { Widget as DashboardWidget };
```

### Static member rendering

A known entry is a typed component value:

```tsx
<Widget.grid project={props.project} />
```

JSX member syntax narrows props to that exact entry:

```tsx
<Widget.grid
	project={props.project}
	gridSize={12}
/>

<Widget.table
	project={props.project}
	sortBy="name"
/>
```

The compiler may reduce a static eager member to the same component edge as a
direct component reference. A static lazy member retains its registry loader
and readiness contract.

### Immutable aliases

Entry aliases preserve registry provenance:

```tsx
const Grid = Widget.grid;

return () => <Grid project={props.project} />;
```

Reassignment is rejected:

```tsx
let Grid = Widget.grid;
Grid = OtherComponent;
```

### Reactive selection

Dynamic selection uses ordinary indexed access:

```tsx
const CurrentWidget = Widget[this.state.widget];

return () => <CurrentWidget project={props.project} />;
```

The compiler recognizes the registry origin and lowers the lookup to a
registry-owned dynamic mounted range. It does not treat it as an arbitrary
object lookup.

### Key types

The registry is the single source of truth:

```ts
type WidgetKey = KeyOf<typeof Widget>;
// 'grid' | 'table' | 'metric'

type DashboardState = {
	widget: KeyOf<typeof Widget>;
};
```

Adding an entry expands the union automatically:

```tsx
const Widget = createComponentRegistry(({ lazy }) => ({
	grid: GridWidget,
	table: lazy(loadTableWidget),
	metric: MetricWidget,
	timeline: TimelineWidget
}));
```

No state declaration changes:

```ts
type DashboardState = {
	widget: KeyOf<typeof Widget>;
	// 'grid' | 'table' | 'metric' | 'timeline'
};
```

Removing or renaming an entry produces type errors at actual uses of the old
key.

Adding an entry with incompatible props may produce an error at a dynamic
render site. That is intentional: key maintenance is automatic, while every
newly possible component must still accept the props provided at that site.

## Proposed public types

The exact declarations must be proven against TypeScript 6 and TypeScript 7.
Conceptually:

```ts
declare const componentRegistryBrand: unique symbol;
declare const lazyRegistryEntryBrand: unique symbol;

export type LazyRegistryEntry<Component extends ComponentFunction<any, any>> = Readonly<{
	readonly [lazyRegistryEntryBrand]: Component;
}>;

export type ComponentRegistryDefinitionEntry =
	| ComponentFunction<any, any>
	| LazyRegistryEntry<ComponentFunction<any, any>>;

export type ComponentRegistryDefinition = Readonly<
	Record<string, ComponentRegistryDefinitionEntry>
>;

export type ResolveRegistryEntry<Entry> =
	Entry extends LazyRegistryEntry<infer Component>
		? Component
		: Entry extends ComponentFunction<any, any>
			? Entry
			: never;

export type ResolveRegistryDefinition<Definition extends ComponentRegistryDefinition> = {
	readonly [Key in keyof Definition]: ResolveRegistryEntry<Definition[Key]>;
};

export type ComponentRegistry<Definition extends ComponentRegistryDefinition> =
	ResolveRegistryDefinition<Definition> & {
		readonly [componentRegistryBrand]: Definition;
	};

export type KeyOf<Registry> =
	Registry extends ComponentRegistry<infer Definition> ? Extract<keyof Definition, string> : never;

export type ComponentProps<Component> =
	Component extends ComponentFunction<any, infer Props> ? Props : never;

export type ComponentRegistryBuilder = {
	lazy<Component extends ComponentFunction<any, any>>(
		load: () => Promise<Component>
	): LazyRegistryEntry<Component>;
};

export function createComponentRegistry<const Definition extends ComponentRegistryDefinition>(
	define: (builder: ComponentRegistryBuilder) => Definition
): ComponentRegistry<Definition>;
```

The public registry properties expose resolved component types. Private runtime
values may be generated component facades carrying registry entry metadata.

`KeyOf` filters out compiler-private symbol keys. It is preferable to repeating
`Extract<keyof typeof Widget, string>` throughout application code.

## Scoped lazy definitions

### Named export

```tsx
const Widget = createComponentRegistry(({ lazy }) => ({
	table: lazy(() => import('./TableWidget.js').then(({ TableWidget }) => TableWidget))
}));
```

### Default export

```tsx
const Widget = createComponentRegistry(({ lazy }) => ({
	table: lazy(() => import('./TableWidget.js').then(({ default: TableWidget }) => TableWidget))
}));
```

### Package export

```tsx
const Editor = createComponentRegistry(({ lazy }) => ({
	date: lazy(() => import('@company/date-editor').then(({ DateEditor }) => DateEditor))
}));
```

The loader must use a statically analyzable import and select one statically
identifiable component export. Opaque runtime module selection is rejected.

Inside the callback, `lazy()` returns a definition descriptor. Outside it,
the registry property is typed as the resolved component:

```ts
type Table = typeof Widget.table;
// typeof TableWidget
```

Reading a lazy property does not start loading:

```ts
const Table = Widget.table;
```

Loading begins when the entry is rendered or explicitly preloaded.

## Free registry helpers

String-named methods should not be attached to the registry because they would
pollute its component key surface. Use free functions.

### Runtime key narrowing

```ts
export function hasComponent<Registry extends ComponentRegistry<any>>(
	registry: Registry,
	value: string
): value is KeyOf<Registry>;
```

Usage:

```tsx
const requested: string = this.state.requestedWidget;

if (!hasComponent(Widget, requested)) {
	return <UnknownWidget requested={requested} />;
}

const CurrentWidget = Widget[requested];
return <CurrentWidget project={props.project} />;
```

### Preloading

```ts
export function preloadComponent(component: ComponentFunction<any, any>): Promise<void>;
```

Usage:

```tsx
<button
	onPointerEnter={() => preloadComponent(Widget.table)}
	onFocus={() => preloadComponent(Widget.table)}
	onClick={() => {
		this.state.widget = 'table';
	}}
>
	Table
</button>
```

For an eager component, preloading resolves immediately. For a lazy registry
entry, it deduplicates the load and validates the target-local component
contract. It never constructs a component instance or runs component setup.

## Complete component examples

### Eager and lazy dashboard widgets

```tsx
import {
	ErrorBoundary,
	Suspense,
	createComponentRegistry,
	type Component,
	type KeyOf
} from '@exactjs/core';

type Project = {
	id: string;
	name: string;
	items: ProjectItem[];
};

type ProjectItem = {
	id: string;
	title: string;
	status: 'todo' | 'doing' | 'done';
};

type WidgetProps = {
	project: Project;
	onSelect(itemId: string): void;
};

type DashboardState = {
	widget: KeyOf<typeof Widget>;
	selectedId?: string;
};

function GridWidget(this: Component<{}>, props: WidgetProps) {
	return () => (
		<div className="grid">
			{props.project.items.map((item) => (
				<button key={item.id} onClick={() => props.onSelect(item.id)}>
					{item.title}
				</button>
			))}
		</div>
	);
}

function MetricWidget(this: Component<{}>, props: WidgetProps) {
	return () => (
		<section>
			<strong>{props.project.items.length}</strong> items
		</section>
	);
}

const Widget = createComponentRegistry(({ lazy }) => ({
	grid: GridWidget,

	table: lazy(() => import('./TableWidget.js').then(({ TableWidget }) => TableWidget)),

	metric: MetricWidget
}));

export function Dashboard(this: Component<DashboardState>, props: { project: Project }) {
	this.state.widget = 'grid';
	this.state.selectedId = undefined;

	function select(itemId: string) {
		this.state.selectedId = itemId;
	}

	return () => {
		const CurrentWidget = Widget[this.state.widget];

		return (
			<main>
				<header>
					<h1>{props.project.name}</h1>

					<label>
						View
						<select value:change={this.state.widget}>
							<option value="grid">Grid</option>
							<option value="table">Table</option>
							<option value="metric">Metrics</option>
						</select>
					</label>
				</header>

				<ErrorBoundary
					fallback={({ error, reset }) => (
						<section role="alert">
							<p>Could not load this view: {String(error.error)}</p>
							<button onClick={reset}>Retry</button>
						</section>
					)}
				>
					<Suspense fallback={<p>Loading view…</p>}>
						<CurrentWidget project={props.project} onSelect={select} />
					</Suspense>
				</ErrorBoundary>

				{this.state.selectedId && <p>Selected: {this.state.selectedId}</p>}
			</main>
		);
	};
}
```

Behavior:

- `grid` and `metric` are eager.
- `table` is emitted as a lazy target-local chunk.
- The key union comes from the registry.
- A newer selection generation supersedes a pending older selection.
- On a later switch, committed content remains visible until the lazy candidate
  is ready.
- A load failure reaches `ErrorBoundary`.
- Resetting the boundary allows retry.
- The same selected key preserves the component instance while props update.
- A different selected key replaces only the registry-owned mounted range.

### Static member rendering

```tsx
import { type Component } from '@exactjs/core';

export function GridPreview(this: Component<{}>, props: { project: Project }) {
	return () => <Widget.grid project={props.project} onSelect={() => undefined} />;
}
```

The compiler validates props against `GridWidget` specifically. Other registry
entries do not become reachable solely because the registry is declared.

A static lazy member uses normal readiness:

```tsx
export function TablePreview(this: Component<{}>, props: { project: Project }) {
	return () => (
		<Suspense fallback={<p>Loading table…</p>}>
			<Widget.table project={props.project} onSelect={() => undefined} />
		</Suspense>
	);
}
```

### Untrusted server-configured key

```tsx
import { createComponentRegistry, hasComponent, type Component } from '@exactjs/core';

type ReportProps = {
	accountId: string;
};

type ReportState = {
	requestedReport: string;
};

function SummaryReport(this: Component<{}>, props: ReportProps) {
	return () => <section>Summary for {props.accountId}</section>;
}

function ActivityReport(this: Component<{}>, props: ReportProps) {
	return () => <section>Activity for {props.accountId}</section>;
}

function UnknownReport(this: Component<{}>, props: { requested: string }) {
	return () => <section role="alert">Unknown report type: {props.requested}</section>;
}

const Report = createComponentRegistry(() => ({
	summary: SummaryReport,
	activity: ActivityReport
}));

export function AccountReports(
	this: Component<ReportState>,
	props: { accountId: string; requestedReport: string }
) {
	this.state.requestedReport = props.requestedReport;

	return () => {
		const requested = this.state.requestedReport;

		if (!hasComponent(Report, requested)) {
			return <UnknownReport requested={requested} />;
		}

		const CurrentReport = Report[requested];
		return <CurrentReport accountId={props.accountId} />;
	};
}
```

`hasComponent()` is both a runtime membership check and a compiler-recognized
finite-selection proof.

### Preloading a likely selection

```tsx
import {
	Suspense,
	createComponentRegistry,
	preloadComponent,
	type Component,
	type KeyOf
} from '@exactjs/core';

type SettingsProps = {
	userId: string;
};

type SettingsState = {
	panel: KeyOf<typeof SettingsPanel>;
};

function ProfileSettings(this: Component<{}>, props: SettingsProps) {
	return () => <section>Profile settings for {props.userId}</section>;
}

const SettingsPanel = createComponentRegistry(({ lazy }) => ({
	profile: ProfileSettings,

	security: lazy(() =>
		import('./SecuritySettings.js').then(({ SecuritySettings }) => SecuritySettings)
	),

	billing: lazy(() => import('./BillingSettings.js').then(({ BillingSettings }) => BillingSettings))
}));

export function Settings(this: Component<SettingsState>, props: SettingsProps) {
	this.state.panel = 'profile';

	return () => {
		const CurrentPanel = SettingsPanel[this.state.panel];

		return (
			<main>
				<nav aria-label="Settings">
					<button onClick={() => (this.state.panel = 'profile')}>Profile</button>

					<button
						onPointerEnter={() => preloadComponent(SettingsPanel.security)}
						onFocus={() => preloadComponent(SettingsPanel.security)}
						onClick={() => (this.state.panel = 'security')}
					>
						Security
					</button>

					<button
						onPointerEnter={() => preloadComponent(SettingsPanel.billing)}
						onFocus={() => preloadComponent(SettingsPanel.billing)}
						onClick={() => (this.state.panel = 'billing')}
					>
						Billing
					</button>
				</nav>

				<Suspense fallback={<p>Loading settings…</p>}>
					<CurrentPanel userId={props.userId} />
				</Suspense>
			</main>
		);
	};
}
```

## Heterogeneous registries

Static member syntax gives exact props automatically:

```tsx
<ContentBlock.hero
	heading="Compiler-led UI"
	body="Ordinary TypeScript with precise updates."
	theme="dark"
/>

<ContentBlock.gallery images={images} columns={3} />
```

For stored dynamic content, derive a discriminated selection:

```ts
export type ComponentSelection<Registry> =
	Registry extends ComponentRegistry<infer Definition>
		? {
				[Key in Extract<keyof Definition, string>]: {
					component: Key;
					props: ComponentProps<ResolveRegistryEntry<Definition[Key]>>;
				};
			}[Extract<keyof Definition, string>]
		: never;
```

Example:

```tsx
const ContentBlock = createComponentRegistry(({ lazy }) => ({
	hero: HeroBlock,
	gallery: lazy(loadGalleryBlock),
	quote: QuoteBlock
}));

type BlockSelection = ComponentSelection<typeof ContentBlock>;

type Block = {
	id: string;
	view: BlockSelection;
};
```

Because TypeScript does not always preserve key/props correlation after
indexing a generic discriminated union, provide a compiler-owned free helper:

```ts
export function renderComponent<Registry extends ComponentRegistry<any>>(
	registry: Registry,
	selection: ComponentSelection<Registry>
): RenderResult;
```

Complete rendering:

```tsx
function Article(this: Component<{ blocks: Block[] }>, props: { blocks: Block[] }) {
	this.state.blocks = props.blocks;

	return () => (
		<article>
			<Suspense fallback={<p>Loading content…</p>}>
				{this.state.blocks.map((block) => (
					<section key={block.id}>{renderComponent(ContentBlock, block.view)}</section>
				))}
			</Suspense>
		</article>
	);
}
```

`renderComponent()` is a narrow compiler-owned operation, not a general vnode
escape. It accepts only a branded registry and its derived selection union.

## Registry definition restrictions

The definition callback is declarative.

Valid:

```tsx
const Widget = createComponentRegistry(({ lazy }) => ({
	grid: GridWidget,
	table: lazy(loadTableWidget)
}));
```

Reject side effects:

```tsx
const Widget = createComponentRegistry(({ lazy }) => {
	console.log('registering');

	return {
		grid: GridWidget
	};
});
```

Reject runtime branching:

```tsx
const Widget = createComponentRegistry(() => ({
	grid: featureEnabled() ? GridWidget : LegacyGridWidget
}));
```

Reject dynamic keys:

```tsx
const Widget = createComponentRegistry(() => ({
	[readWidgetName()]: GridWidget
}));
```

Reject reassignment or mutation:

```tsx
let Widget = createComponentRegistry(() => ({
	grid: GridWidget
}));

Widget = OtherRegistry;
Widget.grid = OtherGrid;
```

Safe spreads from compiler-resolved immutable object literals may be added
after the direct object form is proven:

```tsx
const CommonWidget = {
	grid: GridWidget,
	metric: MetricWidget
} as const;

const Widget = createComponentRegistry(({ lazy }) => ({
	...CommonWidget,
	table: lazy(loadTableWidget)
}));
```

## Identity and lifecycle

The registry selection owns one mounted range.

### Same key

- The existing component instance remains mounted.
- Props update reactively.
- State, tasks, refs, contexts, DOM, and resources retain identity.
- An ordinary authored JSX `key` change may still force replacement.

### Different key

1. Start a new selection generation.
2. Resolve the target-local registry entry.
3. Load code if the entry is lazy.
4. Construct the selected component provisionally.
5. Join blocking descendant readiness.
6. Commit the candidate atomically.
7. Unmount the previous selection after the candidate is ready.
8. Dispose stale candidates without publication.

Registry keys are selection identity. Two keys that point to the same
component still represent different selections and cause replacement:

```tsx
const Result = createComponentRegistry(() => ({
	compact: Results,
	comfortable: Results
}));
```

To preserve one instance, use one entry and pass a mode prop.

### Activity

Parking preserves the selected key, mounted component instance, loaded code,
DOM, state, refs, handlers, and logical portal ownership. A selection change
while parked follows the surrounding Activity work policy and publishes when
the range becomes active where required.

## Lazy loading and readiness

A lazy entry is blocking work owned by its selection generation.

### Initial selection

- The nearest Suspense fallback remains visible.
- The module loads.
- The target-local registry and component contracts are validated.
- The component constructs provisionally.
- Blocking descendant work settles.
- The complete range commits.

### Later selection

- Previously committed content remains visible.
- The next entry prepares as a candidate.
- The candidate replaces the previous range atomically.
- Failed, cancelled, or stale candidates never partially commit.

### Failure and retry

A load failure:

- identifies the registry binding and entry key;
- reaches the nearest ErrorBoundary;
- disposes provisional ownership;
- leaves previously committed content intact during replacement;
- clears the pending load record; and
- retries only after an explicit preload or error-boundary reset.

Successful resolution is retained. Concurrent consumers share one pending
load. Cancelling one consumer does not cancel a JavaScript dynamic import, but
it prevents that consumer from mounting or committing the result.

## Compiler model

Add a registry analysis contract:

```ts
export type ExactComponentRegistryIR = {
	id: string;
	name: string;
	entries: ExactComponentRegistryEntryIR[];
};

export type ExactComponentRegistryEntryIR = {
	key: string;
	mode: 'eager' | 'lazy';
	componentId: string;
	componentName: string;
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	moduleSpecifier?: string;
	exportName?: string;
	ownership: 'exact' | 'react-compat';
	artifactTargets: readonly ('client' | 'server')[];
};
```

The compiler records:

- registry declaration identity;
- entry keys;
- terminal component declarations and exports;
- eager or lazy loading;
- component props;
- native or React ownership;
- client/server placement;
- reachable actions and continuations;
- assets, styles, workers, schemas, and WASM;
- static, aliased, and dynamic render sites; and
- hydration and dynamic-range identities.

### Render graph precision

Static access:

```tsx
<Widget.grid />
```

adds only the `grid` render edge.

A selector typed as:

```ts
'grid' | 'table';
```

adds only those two possible edges.

A selector typed as:

```ts
KeyOf<typeof Widget>;
```

adds every registry entry.

This allows unused registry entries to remain tree-shakeable when no runtime
path can select them.

### Dynamic lowering

Authored:

```tsx
const CurrentWidget = Widget[this.state.widget];
return <CurrentWidget project={props.project} />;
```

Conceptually lowers to:

```ts
const CurrentWidget = selectRegisteredComponent(Widget, this.state.widget);

return createRegistryChild(
	CurrentWidget,
	{
		project: props.project
	},
	'compiler-stable-boundary-id'
);
```

The compiler-generated selection operation validates membership, tracks the
reactive selector, preserves entry provenance, owns the mounted range, and
coordinates loading and placement.

## Runtime representation

`createComponentRegistry()`:

- executes its declarative definition once at module initialization;
- copies entries into a null-prototype immutable record;
- rejects empty and unsafe keys;
- freezes the definition;
- attaches a private registry marker;
- creates stable target-local entry facades; and
- exposes no mutation methods.

Reject keys such as:

```text
__proto__
prototype
constructor
```

Static eager facades may be replaced directly by the component during
compilation. Lazy and dynamic facades retain registry metadata.

A resolved lazy entry is validated for callable shape, native/compatibility
ownership, expected component ID, target role, build identity, execution root,
and conflicting runtime authority.

## Artifact and tree-shaking behavior

Eager entries reachable from a dynamic selector enter the corresponding eager
target graph. Lazy entries remain explicit dynamic imports.

Each lazy entry may carry:

- target-local JavaScript;
- entry-local CSS;
- images, fonts, workers, schemas, and WASM;
- client continuation descriptors;
- hydration registration; and
- inert server executor descriptors.

Compiled library registries carry executable registry contracts attached to
their exported registry values. Consumers do not reconstruct dependency source
graphs or depend on user-visible manifest files.

## SSR and hydration

### SSR

When the selected key is known:

- an isomorphic or server-capable entry renders normally;
- a lazy server entry loads its server artifact;
- a client-only entry emits the existing client-island boundary; and
- the registry range emits compiler-stable registry, entry, component, and
  ownership markers.

### Hydration

Hydration validates registry identity, selected entry identity, component
identity, boundary ownership, build identity, and permitted props.

For a lazy client entry:

1. find the registry marker;
2. select the generated target-local loader;
3. deduplicate the load;
4. validate and compose the loaded component contract;
5. adopt matching DOM; and
6. replace only the registry range after a recoverable mismatch.

Interaction-only hydration reuses the existing lazy-island event queue and
generation fencing where the selected entry is safe for deferred activation.

## Server placement and authority

A registry may contain client, server, and isomorphic entries. Placement
remains per-entry rather than widening the entire registry to one environment.

For a lazy server-capable entry:

- the server artifact exposes an inert allowlist descriptor eagerly;
- the implementation remains in a lazy server chunk;
- dispatch resolves only a compiler-authorized loader;
- the loaded executor contract must match the expected component and operation
  identities; and
- unknown registry entries or continuation identities fail closed.

The client never sends module paths, export names, component functions, loader
functions, or authored registry names. Protocol traffic uses only opaque
compiler-generated identities.

## React compatibility

React entries are accepted only when ownership is statically known and React
compatibility is enabled:

```tsx
import { DatePicker } from 'react-date-picker';

const Editor = createComponentRegistry(() => ({
	date: DatePicker,
	text: TextEditor
}));
```

Lazy React entries retain import provenance:

```tsx
const Editor = createComponentRegistry(({ lazy }) => ({
	date: lazy(() => import('react-date-picker').then(({ default: DatePicker }) => DatePicker))
}));
```

Opaque ownership requires an explicit adapter in the loader. The compiler and
runtime must not guess from package names, registry keys, or function shape.

## Diagnostics

The compiler should report:

- registry definition without an immutable named module binding;
- empty or unstable inferred binding identity;
- definition callback with side effects;
- definition callback that does not return a finite object;
- computed or unsafe entry keys;
- entry that is neither a component nor the scoped `lazy()` result;
- `lazy()` escaping or being called outside the definition callback;
- lazy loader without a static import and selected export;
- registry binding reassignment or property mutation;
- dynamic key not proven by `KeyOf` or `hasComponent()`;
- selected entry props incompatible with every possible key;
- registry entry escaping into an opaque location that loses provenance;
- ambiguous native/React ownership;
- React entry without compatibility;
- placement contradiction;
- non-serializable props crossing an SSR or hydration boundary;
- server-only dependency reaching a client chunk;
- secret-derived data reaching props, HTML, hydration, or public diagnostics;
- mismatched component identity after lazy resolution; and
- conflicting continuation or executor authority.

Diagnostics should identify the registry binding, entry key, render site,
inferred placement, and supported explicit alternative.

## Inspection and explain output

The inspector should present:

```text
Dashboard
└─ registry Widget
   ├─ selected: table
   ├─ generation: 3
   ├─ status: ready
   ├─ boundary: x...
   └─ entries
      ├─ grid
      │  ├─ component: GridWidget
      │  ├─ loading: eager
      │  └─ placement: isomorphic
      ├─ table
      │  ├─ component: TableWidget
      │  ├─ loading: lazy
      │  ├─ chunk: loaded
      │  └─ placement: client
      └─ metric
         ├─ component: MetricWidget
         ├─ loading: eager
         └─ placement: isomorphic
```

Compiler explain output includes entry provenance, possible keys at each render
site, placement, chunk boundaries, props crossing environments, hydration
classification, and reachable server work.

## Package ownership

### `@exactjs/core`

Owns public registry types, registry creation, private branding, entry facades,
selection generations, load deduplication, contract validation, free helpers,
and inspection events.

Suggested modules:

```text
component-registry/contracts.ts
component-registry/creation.ts
component-registry/selection.ts
component-registry/loading.ts
component-registry/errors.ts
```

### `@exactjs/compiler`

Owns definition recognition, entry provenance, key and prop types, lazy import
analysis, render graph edges, placement, artifact planning, lowering,
diagnostics, and explain output.

### `@exactjs/dom`

Owns registry mounted ranges, candidate construction, atomic replacement, DOM
identity, disposal, Activity connectivity, and portal ownership.

### `@exactjs/ssr`

Owns selected entry rendering, registry markers, progressive Suspense output,
client-island fallback, and server load limits.

### `@exactjs/hydrate`

Owns marker validation, lazy client resolution, contract composition, DOM
adoption, interaction activation, event replay, and range-local recovery.

### Build integrations

Vite, Webpack, and Bun own target-specific dynamic imports, chunk generation,
entry-local assets, watch invalidation, and final production graph
verification.

## Delivery plan

### Phase 1: eager native registries

- Add `createComponentRegistry(() => entries)`.
- Require an immutable named module-level binding.
- Infer binding identity and display name.
- Add private branding and frozen entry maps.
- Support `<Widget.grid />`.
- Support immutable aliases such as `const Grid = Widget.grid`.
- Support `KeyOf<typeof Widget>`.
- Preserve static-entry tree shaking.

### Phase 2: reactive finite selection

- Recognize `Widget[reactiveKey]`.
- Determine the finite possible key set from types and control flow.
- Lower a registry-owned dynamic mounted range.
- Preserve same-key component identity.
- Atomically replace different-key selections.
- Add `hasComponent()` for untrusted strings.
- Add stale candidate disposal.

### Phase 3: heterogeneous prop contracts

- Validate props for static member entries.
- Validate common props across dynamic unions.
- Add `ComponentSelection`.
- Add compiler-owned `renderComponent()` for correlated heterogeneous
  selections.
- Cover registry selection inside keyed collections.

### Phase 4: lazy client entries

- Supply scoped `lazy()` in the definition callback.
- Analyze dynamic imports and selected exports.
- Create stable lazy entry facades.
- Integrate Suspense candidates and ErrorBoundary retry.
- Add `preloadComponent()`.
- Verify code splitting and entry-local assets in Vite, Webpack, and Bun.

### Phase 5: SSR and hydration

- Emit registry SSR markers.
- Render eager and lazy selected server entries.
- Adopt matching registry ranges.
- Load and compose lazy client contracts.
- Recover range-locally from mismatches.
- Integrate interaction-only hydration and event replay.

### Phase 6: placement-aware registries

- Preserve mixed client/server/isomorphic entry placement.
- Emit client-island and server-slot boundaries per entry.
- Split target-local registry artifacts.
- Verify final client isolation.
- Add serialization and secret-flow diagnostics.

### Phase 7: lazy server authority

- Emit eager inert executor descriptors.
- Load authorized server implementation chunks on demand.
- Validate component, operation, build, and execution-root identity.
- Preserve cancellation and request limits.
- Reject duplicate or conflicting authority.

### Phase 8: React compatibility and publication

- Support statically classified eager React entries.
- Support lazy React import provenance.
- Require explicit adapters for opaque ownership.
- Emit executable contracts for published registries.
- Add cross-package and package-content fixtures.

### Phase 9: inspection and optimization

- Expose registry state and loading generations.
- Add compiler explain reports.
- Instrument load, construction, readiness, and commit timing.
- Measure compiler cost, client output, retained loader state, and hot runtime
  paths.
- Update current component, SSR, hydration, server, testing, and compatibility
  references when implementation lands.
- Delete or reduce this proposal so implemented behavior is not documented as
  future work.

## Verification

### Compiler tests

Protect literal definitions, eager entries, scoped lazy calls, named/default
exports, safe aliases, static members, dynamic lookup, control-flow narrowing,
key reachability, props, placement, React ownership, diagnostics, and explain
output.

### Type tests

Run against TypeScript 6 and TypeScript 7:

- `KeyOf<typeof Widget>`;
- static member props;
- dynamic common props;
- lazy resolved component types;
- `hasComponent()` narrowing;
- heterogeneous `ComponentSelection`;
- invalid key/prop combinations;
- optional props and children;
- exported and imported registries; and
- React-compatible entries.

### Runtime tests

Protect same-key updates, different-key replacement, rapid A-to-B-to-A
selection, stale loads, failure and retry, preload then render, concurrent
consumers, unmount during load, Activity parking, context, refs, portals,
resources, and cleanup.

### SSR and hydration tests

Protect eager and lazy selection, mixed placement, Suspense fallback,
progressive reveal, matching adoption, selection mismatch, load failure,
interaction hydration, event replay, form state, refs, and boundary-local
recovery.

### Security tests

Protect unknown registry IDs and keys, unsafe dictionary keys, component ID
mismatch, cross-build loader replay, cross-root operation replay, conflicting
contracts, server dependency leakage, secret disclosure, and malicious
published descriptors.

### Bundler tests

For Vite, Webpack, and Bun:

- statically unused entries are removed;
- finite dynamic selectors retain only possible entries;
- lazy entries produce separate chunks;
- eager entries remain eager;
- entry-local CSS and assets remain scoped;
- minification preserves registry contracts;
- watch mode invalidates definition and export changes; and
- production verification reaches every possible client chunk.

### Acceptance applications

Use focused vertical slices:

1. dashboard with static and dynamic widget selection;
2. lazy table selected through Suspense;
3. heterogeneous CMS blocks;
4. untrusted server-configured report key;
5. preloaded settings panels;
6. mixed client/server registry;
7. lazy React-owned editor; and
8. lazy entry invoking a server action after hydration.

## Deferred work and open questions

Deferred:

- runtime entry registration;
- signed remote entry installation;
- keeping several inactive selections mounted automatically;
- instance caching inside a registry;
- arbitrary computed import paths;
- standalone lazy components;
- automatic preload heuristics; and
- partial-prerender continuation through an unloaded entry.

Open questions:

- Whether stable object-literal spreads belong in the first compiler pass.
- Whether a registry binding may be a stable exported namespace member rather
  than a direct module constant.
- Whether failed loads retry only after ErrorBoundary reset or on every
  explicit preload.
- Whether `renderComponent()` is necessary after TypeScript 7 correlation
  behavior is measured.
- How mixed-placement registry markers compose with future partial-prerender
  resumption.
- Whether executable registry contracts extend the component-contract version
  or use a separate private symbol.

These questions do not reopen the core source model:

```tsx
const Widget = createComponentRegistry(({ lazy }) => ({
	grid: GridWidget,
	table: lazy(loadTableWidget)
}));

type WidgetKey = KeyOf<typeof Widget>;

<Widget.grid />;

const CurrentWidget = Widget[this.state.widget];
<CurrentWidget />;
```

The registry definition remains the single source of truth for component keys,
resolved types, lazy boundaries, placement, hydration, and server authority.
