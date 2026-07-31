# Component language

This is the authoring reference for native eXact components. It covers the
TypeScript and TSX forms that the compiler gives framework meaning to. Ordinary
TypeScript keeps its ordinary JavaScript semantics unless this document says
otherwise.

The reference describes source code, not generated `.exact.client`,
`.exact.server`, or `.exact.shared` artifacts. Those files are build output and
are not an application authoring surface.

Compiler-aware editor support exposes the same language model without requiring
generated-code inspection. eXact Language Tools identifies setup-once
initializers, reactive render regions, inferred and explicit tasks, actions,
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

## Component declarations

An eXact component is a function that establishes one durable component
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

The outer function is setup. It normally executes once for each mounted
instance. Props are parent-owned reactive inputs. State, tasks, contexts,
refs, lifecycle registrations, and logging belong to the durable instance.

Every component accepted by the native renderer is compiler-branded. The key
`Symbol.for('@exactjs/component')` stores the component's opaque stable ID; a
function name or setup/render shape is never sufficient runtime ownership.
Compilerless framework libraries may call `markExactComponent()` with an
explicit stable package-qualified identity. React, Preact, and other foreign
functions remain unbranded and cross their compatibility adapter.

The compiler discovers function declarations and function-valued variable
declarations. An uppercase function that contains JSX is a component by
convention. A typed `this: Component<...>` receiver or use of the component
protocol also identifies component ownership.

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

The direct form constructs its result during setup. Use the returned-function
form for reactive component views and whenever setup establishes owned state
or work.

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
	return () => {
		const View = this.state.layout === 'grid' ? ResultGrid : Compact;
		return <View />;
	};
}
```

A reactive choice owns a dynamic slot and replaces only that subtree. Keep a
choice used by one render inside the render function; use a setup-derived
component value when several consumers share the same selection.

```tsx
const Widget = createComponentRegistry(({ lazy }) => ({
	grid: GridWidget,
	table: lazy(() => import('./TableWidget.js').then(({ TableWidget }) => TableWidget))
}));

type WidgetKey = KeyOf<typeof Widget>;

function Dashboard(this: Component<{ widget: WidgetKey }>) {
	return () => {
		const Current = Widget[this.state.widget];
		return <Current />;
	};
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

Mutable dictionaries, reassigned component variables, and unproven string lookups remain
diagnostics because they do not provide a finite component, placement, or artifact graph.

## Setup, render, and deferred callbacks

Code belongs to one of three important execution regions:

- setup runs when the durable instance is constructed;
- the render function may run again to describe the current tree; and
- event, task, lifecycle, timer, and other callbacks run later.

Setup may initialize state, create derived values, register tasks and
lifecycle work, publish context, and create refs. The returned render function
contains only its view expression. Put declarations and imperative control flow
in setup; keep conditional tree logic and keyed iteration in JSX:

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

A render function may not write component state, register task or lifecycle
work, schedule asynchronous work, or perform known DOM, storage, timer, or
other external effects. Those operations would repeat whenever render runs.
Interaction callbacks nested in JSX are deferred work and may mutate state
normally.

### Shared render functions

A component-local arrow is the usual render form. A library may share a regular
function:

```tsx
function renderStatus(this: Component<StatusState>) {
	const label = formatStatus(this.state.status);
	return <output>{label}</output>;
}

function Status(this: Component<StatusState>) {
	return renderStatus;
}
```

The runtime invokes a returned regular function with the component instance as
`this`. Lexical arrows retain their authored receiver, so a module-level shared
arrow cannot be returned directly. An explicitly bound regular function or a
local wrapper is valid:

```tsx
return renderStatus.bind(this);
// or
return () => renderStatus.call(this);
```

## State

`this.state` is a deeply reactive, instance-owned object. Read it normally and
mutate it normally:

```tsx
this.state.profile = { name: 'Ada', tags: [] };
this.state.profile.name = 'Grace';
this.state.profile.tags.push('compiler');
```

Reads connect the current compiler-owned expression, task, list, or derived
value to the path it consumes. Writes invalidate those consumers; they do not
rerun the outer component function.

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

Maps and Sets cross SSR, hydration, action, and continuation boundaries through
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

A safe setup expression that reads state, props, or reactive context becomes a
shared, lazy derived value:

```tsx
const subtotal = this.state.quantity * this.state.price;
const total = subtotal + (props.express ? 14 : 0);

return () => <strong>{total}</strong>;
```

Setup location describes a component-owned relationship. A derived cell caches
one result for all of its DOM, component-prop, list, and task consumers and
uses result equality to stop unchanged values from propagating farther through
the graph. Keep a derived declaration in setup when several consumers should
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
control flow belong in component setup. Conditional expressions in JSX and
callbacks owned by keyed branches or items remain region-local and update only
their structural range. This keeps authored ownership unambiguous and prevents
the same view-local calculation from being duplicated across generated
reactive boundaries.

The compiler may elide the runtime cell for an ordinary setup-derived value
when it is safe to reevaluate, has exactly one eager view consumer, and either
produces a scalar or forwards an existing identity without allocating a new
one. The calculation is fused into that consumer's reactive closure while its
authored declaration remains the inspection definition. This optimization
does not apply to shared bindings, fresh object or collection identities, task
or event consumers, or values explicitly created with `this.reactive()`.

The same rule applies when the result is assigned to state. The destination is
an output and reads on the right are dependencies:

```tsx
this.state.subtotal = this.state.quantity * this.state.price;
[this.state.tax, this.state.total] = calculateTotals(this.state.subtotal, props.taxRate);
```

Every target in setup-time reactive destructuring must be a writable state
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
replaces the underlying watcher.

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

### Classes

`className` is the authored property. The DOM and SSR render it as the HTML
`class` attribute. Its value may be a string, nested arrays, truthy-key maps,
or reactive values:

```tsx
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

### Native form bindings

Three compiler-owned namespaced props provide two-way bindings to one writable
reactive location:

```tsx
<input value:input={this.state.name} />
<input type="number" value:change={this.state.quantity} />
<input type="date" value:change={this.state.date} />
<input type="checkbox" checked:change={this.state.subscribed} />
<input type="radio" value="ground" checked:change={this.state.delivery} />
<input type="checkbox" value="ups" checked:change={this.state.carriers} />
<select multiple value:change={this.state.tags}>...</select>
```

The supported combinations are:

| Syntax           | Controls                                         | State value                                                         |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `value:input`    | `input`, `textarea`                              | string, number, `Date`, or a nullable variant                       |
| `value:change`   | `input`, `textarea`, `select`, `select multiple` | scalar value, or a homogeneous string/number array for multi-select |
| `checked:change` | checkbox or radio `input`                        | boolean, the radio value, or a homogeneous string/number array      |

Select controls always commit on `change`. Boolean state requires
`type="checkbox"`. A `Date` requires `type="date"`. An array-bound checkbox
requires an explicit `value`, and an array is otherwise valid only for
`<select multiple>`.

The binding generates the corresponding `value` or `checked` prop, so that prop
cannot also be written explicitly. An authored handler for the same event is
allowed and runs after state has been updated:

```tsx
<input
	value:input={this.state.name}
	onInput={() => this.log.info('edited', { name: this.state.name })}
/>
```

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
during setup, and attach it with `ref`:

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

The registry returns `undefined` before fulfillment and after removal. Refs
follow element ownership through updates, hydration, and `Activity`
parking.

### Keyed collections

An ordinary reactive `Array.map()` is compiled as a keyed collection when
identity is available from a type annotation:

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
really is the item's identity.

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

## Tasks

An ordinary local function becomes a task when the compiler finds task policy,
task capabilities, placement-sensitive effects, or a known activation host.
Calling it during setup declares component-owned work:

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

Call setup-activated tasks directly during setup, not inside render functions.
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

Lifecycle handlers are registered during setup:

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
Task cleanup remains the preferred owner for resources acquired by a task.

`this.log` is the component-scoped logger. It follows the nearest logger
context and adds component identity to structured log records.

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

Plugins may register namespaced directives such as
`@exact namespace.directive`. Such a directive is valid only when the owning
native compiler extension is configured.

## Unsupported or diagnostic forms

The compiler reports an error instead of emitting a partial approximation when
it cannot preserve both JavaScript behavior and eXact's reactive, ownership, or
transport contract. Important examples are:

- state writes, lifecycle registration, scheduling, and known external
  effects inside a rerunnable render body;
- a module-level shared arrow returned as a render function;
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
