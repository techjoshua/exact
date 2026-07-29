# Compiler-aware language tools

## Status

Implemented by the compiler source-inspection contracts and no-emit language
service, `@exactjs/language-server`, and the eXact VS Code extension. The current
public contract is documented in [`../language-tools.md`](../language-tools.md).
Editor publication uses immutable document snapshots and exposes only
`EXACT`-namespaced diagnostics; ordinary TypeScript diagnostics remain owned by
the editor's TypeScript service.

Runtime instance inspection and Chromium DevTools remain outside this static
language-tools delivery and are implemented separately by
[`server-cooperative-full-stack-devtools.md`](server-cooperative-full-stack-devtools.md).
The implemented source identities and vocabulary are their static foundation;
they are not dispatch identities or authorization capabilities.

## Decision summary

Build eXact Language Tools around one rule:

> At any point while authoring a component, a developer can see how the eXact
> compiler classifies the code, why it made that decision, and how to change the
> classification safely.

The implementation will:

- keep the eXact compiler as the sole authority for component semantics;
- add a no-emit, incremental source-inspection service to the pinned
  TypeScript-Go compiler;
- describe setup, render, inferred and explicit tasks, actions, interactions,
  derived values, bindings, lifecycle registrations, dependencies, effects,
  placement, readiness, scheduling, cancellation, and disposal as typed source
  entities;
- preserve the evidence behind each inferred classification;
- return structured diagnostics with related ranges, explanations,
  consequences, and compiler-planned fixes;
- implement semantics-preserving refactor plans in the compiler, beginning with
  conversion between inferred and explicit tasks;
- expose those contracts through a dedicated eXact language server;
- let VS Code present semantic tokens, region markers, hover, CodeLens, inlay
  hints, diagnostics, code actions, an outline, and a component-semantics view;
- complement rather than replace VS Code's ordinary TypeScript language
  features; and
- keep all rich inspection data in memory during editor analysis without
  writing generated JavaScript, manifests, source maps, or inspection files.

For future runtime inspection, builds may optionally derive a separate,
server-owned inspection catalog from this analysis. Rich descriptions should
not be embedded in client bundles.

## Goals

### Make inference legible

The extension must make these distinctions apparent without requiring generated
code inspection:

- component initialization, which normally runs once per durable instance;
- the returned render function and its fine-grained reactive expressions;
- ordinary setup statements;
- compiler-inferred task regions created from async component source;
- explicit `this.task()` registrations;
- blocking versus nonblocking readiness;
- normal versus deferred priority;
- inferred or requested client/server placement;
- automatically supplied abort signals;
- generation-owned resources and cleanup;
- state reads, state writes, context effects, and transported values;
- staged versus immediate publication;
- derived reactive values and their consumers;
- actions and their concurrency policy; and
- invalid or ambiguous classifications.

### Explain decisions with source evidence

A label such as “server task” is incomplete. The developer needs to know that a
request-scoped context forced server placement, which call produced that
requirement, and which other source location conflicts with it.

### Surface build-equivalent errors while typing

eXact-specific diagnostics shown in the editor must come from the same semantic
passes and stable diagnostic codes used by production compilation. The
extension must not approximate placement, ownership, serialization, secret
flow, task effects, or render restrictions with editor-only heuristics.

### Make explicitness reversible

Compiler inference should not trap authors in either concise or explicit
source. When behavior is equivalent, a developer should be able to convert
inferred work to an explicit task and later simplify an explicit task back to
inferred source.

### Establish the static half of inspection

Source entity identities and descriptions should later correlate with runtime
instances and events, including across microfrontend execution roots and
deployments. They must not become server dispatch identities or security
credentials.

## Non-goals

This proposal does not:

- implement the Chromium DevTools extension;
- define live component-instance, state, context, or task-event protocols;
- allow editor or agent tooling to mutate running component state;
- replace TypeScript completion, rename, navigation, formatting, or ordinary
  type checking;
- expose generated JavaScript as the primary explanation surface;
- add annotations that application authors must maintain for inspection;
- require explicit tasks merely to improve editor output;
- promise that every explicit task can be reduced to inferred source;
- make compiler-internal planning records a stable runtime ABI; or
- require runtime inspection metadata in hardened builds.

## Product model

The feature has three owners:

```text
Pinned eXact compiler
├─ classifies source
├─ records inference evidence
├─ produces eXact diagnostics
└─ plans semantics-aware source edits

eXact language server
├─ owns open projects and unsaved overlays
├─ schedules incremental analysis
├─ rejects stale results
├─ translates compiler contracts to LSP
└─ owns virtual explanation documents

VS Code extension
├─ starts and connects to the language server
├─ registers semantic presentation
├─ renders component semantics
├─ applies returned WorkspaceEdits
└─ respects workspace trust and user preferences
```

The extension must contain no independent eXact parser or classifier.

## Authoring experience

Consider a complete inferred component:

```tsx
interface ProductState {
	product?: Product;
}

interface ProductPageProps {
	productId: string;
}

export async function ProductPage(this: Component<ProductState>, props: ProductPageProps) {
	const products = this.getContext(Products);

	this.state.product = await products.find(props.productId);

	const displayPrice = this.reactive(() =>
		this.state.product ? formatPrice(this.state.product.price) : ''
	);

	return () => (
		<main>
			<h1>{this.state.product?.name ?? 'Product'}</h1>
			<p>{displayPrice}</p>
		</main>
	);
}
```

The compiler-backed component-semantics view should present:

```text
ProductPage
├─ Initialization
│  └─ products ← Products context
├─ Tasks
│  └─ Product lookup
│     ├─ origin: inferred
│     ├─ placement: server
│     ├─ readiness: blocking
│     ├─ priority: normal
│     ├─ dependency: props.productId
│     ├─ effect: state.product
│     ├─ publication: staged
│     └─ cancellation: generation AbortSignal
├─ Derived values
│  └─ displayPrice
│     └─ state.product.price
└─ Render
   ├─ heading text ← state.product.name
   └─ price text ← displayPrice
```

The source editor should show a compact component CodeLens and put the task
facts on a hoverable badge at the authored operation:

```text
eXact · 1 task

this.task(📋 🖥 async ...)
```

Hovering the awaited expression should explain:

```text
Inferred blocking server task

Why this is a task:
The awaited result flows into component state. The compiler lowers this
region into owned, restartable continuation work.

Why it runs on the server:
products comes from the request-scoped Products context.

Why it is blocking:
state.product is required by the initial rendered candidate.

Dependency:
• props.productId

Effect:
• staged write to state.product

Cancellation:
Dependency changes and component disposal abort the active generation.
The recognized repository call receives the generation AbortSignal.
```

This explanation is a projection of structured compiler facts, not authored
prose stored separately from analysis.

## Source-inspection model

### Source entities

Add a stable public compiler contract for editor-facing source analysis:

```ts
export type ExactSourceInspection = Readonly<{
	generation: number;
	filename: string;
	components: readonly ExactInspectedComponent[];
	diagnostics: readonly ExactSourceDiagnostic[];
}>;
```

Each component contains a tree of semantic source entities:

```ts
export type ExactSourceEntityKind =
	| 'component'
	| 'initializer'
	| 'render'
	| 'render-expression'
	| 'inferred-task'
	| 'explicit-task'
	| 'action'
	| 'interaction'
	| 'derived'
	| 'state-assignment'
	| 'binding'
	| 'context-read'
	| 'context-write'
	| 'lifecycle'
	| 'registry-selection';

export type ExactSourceEntity = Readonly<{
	id: string;
	kind: ExactSourceEntityKind;
	name?: string;
	range: ExactSourceRange;
	selectionRange: ExactSourceRange;
	children: readonly ExactSourceEntity[];
	classification?: ExactSourceClassification;
	reasons: readonly ExactInferenceReason[];
}>;
```

`range` covers the complete semantic region. `selectionRange` identifies the
small authored token or expression that an outline selects. IDs remain stable
across an incremental generation when the underlying compiler node identity
survives. Consumers must discard them when the language-service generation or
project identity changes.

These IDs are diagnostic correlation values. They are not:

- action IDs;
- continuation dispatch IDs;
- hydration identities;
- package ABI;
- cross-build stable identifiers; or
- authorization capabilities.

### Component region classification

```ts
export type ExactSourceClassification =
	| ExactInitializerClassification
	| ExactRenderClassification
	| ExactTaskClassification
	| ExactActionClassification
	| ExactDerivedClassification
	| ExactStateAssignmentClassification
	| ExactBindingClassification
	| ExactLifecycleClassification;
```

An initializer records setup-once ownership:

```ts
export type ExactInitializerClassification = Readonly<{
	kind: 'initializer';
	execution: 'once-per-instance';
	placement: ExactPlacement;
}>;
```

Each direct setup state assignment retains the authored decision that would
otherwise be hidden by normalization:

```ts
export type ExactStateAssignmentClassification = Readonly<{
	kind: 'state-assignment';
	execution: 'once-per-instance' | 'deferred-reactive';
	dependencies: readonly ExactSourceDependency[];
	effect: ExactSourceEffect;
}>;
```

A render region records rerunnable, fine-grained behavior:

```ts
export type ExactRenderClassification = Readonly<{
	kind: 'render';
	execution: 'reactive';
	dependencies: readonly ExactSourceDependency[];
	effects: readonly ExactSourceEffect[];
}>;
```

A task carries the normalized compiler decision:

```ts
export type ExactTaskClassification = Readonly<{
	kind: 'task';
	origin: 'inferred' | 'explicit';
	placement: ExactPlacement;
	placementRequest?: 'client' | 'server';
	priority: 'normal' | 'deferred';
	readiness: 'blocking' | 'nonblocking';
	dependencies: readonly ExactSourceDependency[];
	effects: readonly ExactSourceEffect[];
	publication: 'staged' | 'immediate';
	cancellation: 'generation-abort-signal';
	signalCalls: readonly ExactSuppliedSignal[];
	resources: readonly ExactOwnedResource[];
	cleanup: 'none' | 'generation' | 'component';
}>;
```

The language model should extend the current native task analysis rather than
replace it. Existing task ranges, placement, readiness, priority, dependency
sources, reads, writes, context effects, resources, and signal calls already
provide much of this data.

### Dependencies and effects

Source inspection must preserve paths and ranges:

```ts
export type ExactSourceDependency = Readonly<{
	kind: 'state' | 'prop' | 'context' | 'derived' | 'capture';
	path: string;
	range: ExactSourceRange;
	confidence: 'exact' | 'broad' | 'unknown';
}>;

export type ExactSourceEffect = Readonly<{
	kind: 'state-write' | 'context-write' | 'external-effect';
	path?: string;
	range: ExactSourceRange;
	confidence: 'exact' | 'broad' | 'unknown';
}>;
```

The editor must never manufacture precise-looking paths from broad or unknown
analysis. It should display uncertainty explicitly:

```text
Dependency: state.filters.* (broad)
```

### Typed inference reasons

Do not expose placement reasoning only as strings. Add a typed reason graph:

```ts
export type ExactInferenceReason = Readonly<{
	code: ExactInferenceReasonCode;
	summary: string;
	range: ExactSourceRange;
	related?: readonly ExactRelatedReason[];
}>;

export type ExactInferenceReasonCode =
	| 'awaited-state-flow'
	| 'initial-render-dependency'
	| 'reactive-dependency'
	| 'browser-api'
	| 'server-context'
	| 'server-module'
	| 'requested-placement'
	| 'requested-readiness'
	| 'requested-priority'
	| 'recognized-signal-call'
	| 'owned-resource'
	| 'returned-cleanup'
	| 'secret-qualified-flow'
	| 'transport-requirement'
	| 'render-effect'
	| 'unknown-call-effect';
```

The code is stable enough for tooling. `summary` remains human-readable and can
improve without changing clients. Related reasons carry their own ranges and
describe propagation paths such as:

```text
ProductPage task
→ calls loadProduct
→ reads Products context
→ Products is request-scoped and server-resident
```

The existing environment-effect source paths are the starting point for this
graph.

## Compiler API

### Dedicated language-service facade

Do not make VS Code orchestrate `transformSource()` calls. Add a long-lived,
editor-oriented API:

```ts
export type ExactLanguageServiceOptions = Readonly<{
	root: string;
	configFile?: string;
	noEmit?: true;
}>;

export type ExactLanguageServiceChange = Readonly<
	| {
			kind: 'upsert';
			filename: string;
			version: number;
			source: string;
	  }
	| {
			kind: 'close';
			filename: string;
	  }
	| {
			kind: 'delete';
			filename: string;
	  }
>;

export interface ExactLanguageService {
	synchronize(
		changes: readonly ExactLanguageServiceChange[],
		signal?: AbortSignal
	): Promise<ExactLanguageServiceUpdate>;

	inspect(
		filename: string,
		options?: ExactInspectionRequest,
		signal?: AbortSignal
	): Promise<ExactSourceInspection>;

	refactor(
		request: ExactRefactorRequest,
		signal?: AbortSignal
	): Promise<ExactRefactorPlan | undefined>;

	dispose(): Promise<void>;
}
```

`noEmit` is deliberately fixed to `true` for this service. It guarantees that
editor analysis never writes:

- compiled JavaScript;
- client/server artifacts;
- manifests;
- source maps;
- inspection catalogs; or
- other generated project files.

The compiler may retain parsed programs, semantic graphs, dependency indexes,
and immutable analysis results in memory.

### Incremental synchronization

`synchronize()` returns one monotonically increasing generation:

```ts
export type ExactLanguageServiceUpdate = Readonly<{
	generation: number;
	changedFiles: readonly string[];
	affectedFiles: readonly string[];
	diagnostics: readonly ExactSourceDiagnostic[];
}>;
```

The service must:

1. overlay unsaved editor text over disk files;
2. reuse the retained TypeScript-Go project and checker;
3. invalidate dependents only when exported or semantic signatures change;
4. invalidate configuration and plugin analysis when relevant configuration
   changes;
5. associate every response with a generation;
6. observe cancellation where the native compiler can stop safely; and
7. permit the language server to discard any response older than the newest
   document version.

The existing compiler session and expression language-service invalidation
logic are implementation precedents. The eXact service must remain owned by the
native compiler because only it has the complete component and placement
analysis.

### Asynchronous native transport

The current JavaScript compiler facade exposes synchronous requests through a
worker and shared memory. The language server must not block its JSON-RPC event
loop behind that interface.

Add an asynchronous native-session transport for editor workloads:

```ts
interface ExactNativeLanguageClient {
	request<T>(request: ExactNativeLanguageRequest, signal?: AbortSignal): Promise<T>;

	dispose(): Promise<void>;
}
```

The language server may serialize semantic mutations within one workspace, but
it must continue accepting document changes and cancellation while analysis is
active. Initial delivery may cancel by marking a generation stale before the
native compiler supports interruption at every analysis phase. Stale results
must never be published.

The build compiler keeps its existing synchronous convenience facade. Do not
force bundlers and command-line compilation onto the language-server transport.

### Project ownership

Create one language-service workspace for each resolved eXact/TypeScript project
configuration. Multi-root VS Code workspaces may own several independent
services. A file outside configured projects receives a bounded inferred
project, clearly identified as such.

Closing a workspace disposes:

- the native project session;
- document overlays;
- dependency indexes;
- pending requests;
- cached semantic-token results; and
- virtual explanation documents.

## Diagnostic contract

The current native diagnostic shape contains severity, code, message, filename,
start, and length. Extend editor-facing diagnostics without breaking the compact
build-facing representation:

```ts
export type ExactSourceDiagnostic = Readonly<{
	code: string;
	severity: 'information' | 'warning' | 'error';
	summary: string;
	explanation: string;
	range: ExactSourceRange;
	related: readonly Readonly<{
		message: string;
		filename: string;
		range: ExactSourceRange;
	}>[];
	fixes: readonly ExactDiagnosticFixSummary[];
}>;
```

### Diagnostic writing standard

Every eXact diagnostic should answer:

1. What did the compiler infer or reject?
2. Which source facts caused that result?
3. Why do those facts conflict with an eXact guarantee?
4. What behavior would be unsafe or ambiguous if compilation continued?
5. Which valid fixes are available?

Do not prescribe a fix that the compiler cannot validate.

### Example: conflicting placement

Invalid source:

```tsx
interface ProductState {
	product?: Product;
}

export async function ProductPage(this: Component<ProductState>, props: { productId: string }) {
	const products = this.getContext(Products);

	this.state.product = await products.find(props.productId);
	document.title = this.state.product.name;

	return () => <ProductDetails product={this.state.product} />;
}
```

The primary diagnostic:

```text
EXACT_TASK_PLACEMENT_CONFLICT

This inferred task requires both server and client execution.

products.find() requires server execution because Products is a
request-scoped server context.

document.title requires client execution because document is a browser API.

Split the data operation from the browser effect.
```

The diagnostic highlights the task region and adds related ranges to
`products.find()` and `document.title`.

An offered compiler fix may produce:

```tsx
interface ProductState {
	product?: Product;
}

export function ProductPage(this: Component<ProductState>, props: { productId: string }) {
	const products = this.getContext(Products);

	this.task.server.blocking(props.productId, async (productId, { signal }) => {
		this.state.product = await products.find(productId, { signal });
	});

	this.task.client(this.state.product?.name, (name) => {
		if (name) document.title = name;
	});

	return () => <ProductDetails product={this.state.product} />;
}
```

The fix is available only if the compiler can preserve the data flow and
establish a valid client dependency. Otherwise the diagnostic explains the
split but leaves the edit to the author.

### Parity with build diagnostics

Stable eXact diagnostic codes and source facts must originate in native
analysis. Build formatting may remain concise, while the language server
projects the same diagnostic into explanation, related information, and code
actions.

VS Code's TypeScript extension remains responsible for ordinary TypeScript
diagnostics. eXact Language Tools publishes eXact-specific diagnostics and any
compiler compatibility diagnostic that TypeScript alone cannot express. Avoid
duplicating an identical TypeScript diagnostic at the same range.

## Compiler-planned refactoring

### Contract

The compiler returns a complete, version-bound plan:

```ts
export type ExactRefactorRequest = Readonly<{
	generation: number;
	filename: string;
	range: ExactSourceRange;
	kind: ExactRefactorKind;
}>;

export type ExactRefactorKind =
	| 'convert-to-explicit-task'
	| 'convert-to-inferred-task'
	| 'make-placement-explicit'
	| 'remove-redundant-placement'
	| 'make-blocking'
	| 'make-nonblocking'
	| 'split-placement-conflict';

export type ExactRefactorPlan = Readonly<{
	title: string;
	semanticChange: 'none' | 'placement' | 'readiness' | 'priority' | 'ownership';
	explanation: string;
	edits: readonly ExactSourceEdit[];
	expected: ExactClassificationSummary;
}>;
```

The language server rejects a plan whose generation no longer matches the open
documents. VS Code previews the edits and semantic summary before application
when the operation changes behavior.

### Convert an inferred task to an explicit task

Starting source:

```tsx
interface ProductState {
	product?: Product;
}

export async function ProductPage(this: Component<ProductState>, props: { productId: string }) {
	const products = this.getContext(Products);

	this.state.product = await products.find(props.productId);

	return () => <ProductDetails product={this.state.product} />;
}
```

The compiler offers **Convert inferred task to explicit task** and produces:

```tsx
interface ProductState {
	product?: Product;
}

export function ProductPage(this: Component<ProductState>, props: { productId: string }) {
	const products = this.getContext(Products);

	this.task.server.blocking(props.productId, async (productId, { signal }) => {
		this.state.product = await products.find(productId, { signal });
	});

	return () => <ProductDetails product={this.state.product} />;
}
```

The plan reports:

```text
Before: inferred blocking server task
After: explicit blocking server task

Preserved:
• dependency evaluation and ordering
• server placement
• blocking readiness
• normal priority
• cancellation
• staged state publication
• error and finally behavior
```

The compiler must:

- choose explicit facets that preserve normalized policy;
- turn inferred reactive reads into explicit dependency arguments in source
  order;
- bind callback parameters without changing evaluation count;
- expose `{ signal }` only when required;
- rewrite recognized implicit signal injection to the supported explicit call
  shape;
- remove `async` from the component only when no inferred awaits remain;
- preserve imports, comments, indentation, and surrounding control flow; and
- decline when an equivalent explicit registration cannot be expressed.

### Convert an explicit task to an inferred task

Starting source:

```tsx
interface ProductState {
	product?: Product;
}

export function ProductPage(this: Component<ProductState>, props: { productId: string }) {
	const products = this.getContext(Products);

	this.task.server.blocking(props.productId, async (productId, { signal }) => {
		this.state.product = await products.find(productId, { signal });
	});

	return () => <ProductDetails product={this.state.product} />;
}
```

When equivalence is proven, **Convert to inferred task** produces:

```tsx
interface ProductState {
	product?: Product;
}

export async function ProductPage(this: Component<ProductState>, props: { productId: string }) {
	const products = this.getContext(Products);

	this.state.product = await products.find(props.productId);

	return () => <ProductDetails product={this.state.product} />;
}
```

The compiler removes the explicit signal only because it recognizes the
repository call and can preserve cancellation during inferred lowering.

Do not offer this conversion when an explicit task has:

- an authored identity required elsewhere;
- an explicit policy that inference would not select;
- deliberate nonblocking behavior;
- cleanup or an owned external resource;
- external effects rather than state-producing work;
- manual dependencies that differ from inferred source reads;
- signal use that cannot be reconstructed;
- task-registration references;
- unsupported concurrency or lifecycle behavior;
- control flow whose staging or exception behavior would change; or
- any other unproven semantic difference.

The editor may present safe simplification as a quiet refactor opportunity. It
must not warn merely because explicit source could be shorter.

### Refactoring equivalence proof

For a semantics-preserving plan, analyze the proposed source in memory before
returning edits and compare:

- normalized placement and requested placement;
- readiness and priority;
- ordered dependency sources;
- state and context reads;
- state and context writes;
- publication mode;
- recognized signal calls;
- resource and cleanup ownership;
- continuation captures and transported effects;
- exception/finally shape where relevant; and
- compiler diagnostics.

If equivalence fails, return no refactor or return an explicitly behavior-
changing operation with the semantic delta. Never label a best-effort textual
rewrite as semantics-preserving.

## Language server

### Package ownership

Implementation should introduce a dedicated language-server package rather
than putting LSP concerns in `@exactjs/compiler`.

The compiler package owns:

- source-inspection contracts;
- inference reasons;
- diagnostic facts;
- source transformations;
- refactoring equivalence;
- native project analysis; and
- no-emit language-service APIs.

The language-server package owns:

- LSP connection lifecycle;
- workspace and project discovery;
- document versions and overlays;
- request cancellation;
- stale-result suppression;
- conversion to LSP ranges and edits;
- semantic-token legends;
- virtual documents; and
- user-facing command routing.

The VS Code extension owns:

- process startup;
- VS Code configuration;
- workspace trust;
- component-semantics UI;
- icons, colors, and decorations;
- commands and editor navigation; and
- installation/update experience.

When implemented, each new package must receive its own `README.md` and
`AGENTS.md`, and the compiler, docs application, root README, package contents,
and reusable eXact authoring guidance must be updated together.

### Standard LSP features

Use standard Language Server Protocol capabilities wherever possible:

| Experience                        | LSP capability               |
| --------------------------------- | ---------------------------- |
| eXact compiler errors             | diagnostics                  |
| classification colors             | semantic tokens full/delta   |
| detailed explanations             | hover                        |
| concise operation labels          | inlay hints                  |
| compact component summaries       | CodeLens                     |
| component semantic outline        | document symbols             |
| safe fixes and transformations    | code actions                 |
| apply compiler-planned edits      | workspace edits              |
| jump to contributing source facts | definition/related locations |

Use custom requests only for data that standard LSP cannot represent well:

```text
exact/componentSemantics
exact/explainEntity
exact/previewSemanticChange
```

The component-semantics panel consumes structured data from these requests. It
must not parse hover Markdown.

### Relationship with VS Code TypeScript support

Do not plug eXact behavior into VS Code through TypeScript-server heuristics.
The application may declare a different TypeScript package, while eXact
compilation uses its pinned TypeScript-Go revision and custom semantic passes.

Run a separate eXact language server beside VS Code's TypeScript extension:

- TypeScript provides ordinary language features;
- eXact provides framework classifications, diagnostics, explanations, and
  refactors;
- duplicate semantic coloring should be avoided by limiting eXact tokens to
  eXact-owned distinctions; and
- eXact refactors delegate formatting to VS Code after applying compiler-owned
  structural edits.

## VS Code presentation

### Semantic token vocabulary

Start with modifiers rather than replacing ordinary TypeScript token kinds:

```text
exact.component
exact.initializer
exact.render
exact.inferredTask
exact.explicitTask
exact.action
exact.derived
exact.dependency
exact.effect
exact.server
exact.client
exact.blocking
exact.deferred
exact.owned
exact.disposable
```

Themes may choose subtle distinctions. The extension should ship restrained
defaults and document customization.

### Region visibility

Semantic tokens identify individual source tokens. Optional gutter decorations
mark the selected operation line rather than painting an entire function body:

```text
INIT  component setup
TASK  compiler-inferred continuation
VIEW  returned render function
```

Default decorations should emphasize task and client/server boundaries without
coloring every ordinary reactive read.

### CodeLens

Example:

```text
eXact · 1 task · 1 reactive
```

CodeLens is configurable independently because some developers prefer a less
dense editor.

### Inlay hints

Assignment badges precede the assignment and call badges follow the opening
parenthesis. Useful facts include:

- `inferred server`;
- `blocking`;
- `nonblocking`;
- `signal supplied`;
- `disposed with generation`;
- `runs once per instance`; and
- `reactive dependency`.

Do not display every available hint simultaneously. Default to placement,
readiness, and ownership facts that materially affect behavior. Hover and the
semantics panel contain the complete account.

### Component-semantics view

Provide a tree organized by authored component rather than compiler artifact:

```text
CheckoutPage
├─ Initialization
├─ Tasks
│  ├─ Load cart — inferred, server, blocking
│  └─ Persist draft — explicit, client, deferred
├─ Actions
│  └─ Place order — server, latest
├─ Derived values
│  └─ total — state.cart.items
└─ Render
   ├─ cart rows
   └─ total text
```

Selecting an item reveals its source, reasons, dependencies, effects, supplied
capabilities, and available refactors. Selecting a reason navigates to its
source range, including another file when placement propagated through a call.

### Compiler separation view

Add **eXact: Show Component Semantics** and **eXact: Show Compiler Separation**.
The latter presents conceptual roles:

```text
ProductPage
├─ Shared setup
│  ├─ initialize state
│  └─ register owned work
├─ Client
│  ├─ render DOM
│  └─ dispatch product continuation
└─ Server
   ├─ resolve Products context
   ├─ load product
   └─ return state.product
```

This is a virtual explanation document backed by the current analysis
generation. It is not generated JavaScript and is not editable.

## Build-time inspection boundary

The language server always requests rich inspection in memory with `noEmit:
true`. Application builds need a separate choice:

```ts
type ExactCompilerInspectionEmission = boolean | 'auto';

interface ExactCompilerOptions {
	emitInspection?: ExactCompilerInspectionEmission;
}
```

Future runtime inspection should interpret this as:

- `true`: generate a server-owned inspection catalog for client and server
  source owned by that deployment;
- `false`: omit the catalog and strip correlation hooks used only for
  inspection where possible;
- `auto`: enable when effective server `allowDebug` is `true`, a function, or
  development-defaulted; disable when it is explicitly false or
  production-defaulted.

A function-valued `allowDebug` means some requests may be authorized, so
`auto` must retain the server catalog. A hardened environment explicitly sets
both:

```ts
export default defineConfig({
	compiler: {
		emitInspection: false
	},

	server: {
		allowDebug: false
	}
});
```

This proposal defines only the compiler-side separation. Server emission,
runtime events, Chromium DevTools, authorization, secret redaction, and
microfrontend catalog federation belong to the runtime-inspection proposal.

### Microfrontend compatibility

The source model must be capable of later qualifying runtime catalog entities
by execution root and deployment:

```ts
type ExactRuntimeInspectionReference = Readonly<{
	executionRoot: string;
	deploymentId: string;
	entityId: string;
}>;
```

The language server does not need deployment values for ordinary source
analysis. Compiler entity IDs remain local to the source project. When a
producer build later emits an inspection catalog, it includes only the graph
reachable from that exposure and retains producer provenance. The page host
must not absorb unrelated producer source data.

## Configuration

The VS Code extension should initially expose:

```json
{
	"exact.languageTools.enabled": true,
	"exact.languageTools.codeLens": true,
	"exact.languageTools.inlayHints": "important",
	"exact.languageTools.regionDecorations": "boundaries",
	"exact.languageTools.semanticsView": true,
	"exact.languageTools.trace.server": "off"
}
```

Suggested modes:

- inlay hints: `off`, `important`, `all`;
- region decorations: `off`, `boundaries`, `all`;
- server trace: `off`, `messages`, `verbose`.

Compiler meaning must not change with presentation settings.

## Workspace trust and security

The extension launches the installed eXact compiler and may read project
configuration. Respect VS Code workspace trust:

- in a trusted workspace, load configured compiler plugins and project
  configuration normally;
- in an untrusted workspace, do not execute workspace binaries, configuration
  modules, or compiler plugins;
- offer a limited syntax-only mode when it can run without workspace code;
- clearly identify which compiler executable and version are active; and
- never send source, diagnostics, or inspection data to a network service.

The language server is local and owns no runtime debugging permission.

## Performance and responsiveness

### Requirements

- Opening a project performs one baseline analysis and then reuses it.
- A text edit updates an overlay rather than writing the file to disk.
- Local edits do not reanalyze unrelated projects.
- Project dependents are revisited only when their relevant semantic signature
  changes.
- Semantic tokens support delta updates.
- Rapid edits cancel or supersede older generations.
- Stale diagnostics, hovers, CodeLens, and refactor plans are never published.
- Expensive full-project explanations are computed on demand.
- Closed documents release overlays while retaining bounded project state.

### Measurement

Add instrumentation for:

- project-open time;
- synchronization time;
- changed and affected file counts;
- parse, check, eXact analysis, and explanation time;
- semantic-token time;
- refactor planning and equivalence-check time;
- cancellation and stale-result counts;
- retained project/source/node counts; and
- native process memory.

Establish representative small, medium, and microfrontend workspaces before
setting release thresholds. Acceptance should compare incremental latency and
retained memory against that baseline rather than claiming a universal
millisecond target without evidence.

## Delivery plan

### Phase 1: inspection contracts and source regions

- Add source ranges to every compiler fact needed for editor presentation.
- Define `ExactSourceInspection`, source entities, classifications,
  dependencies, effects, and typed inference reasons.
- Project current task, continuation, reactive binding, context, resource,
  signal-call, and placement facts into the new model.
- Identify initializer, render, inferred-task, explicit-task, action, derived,
  binding, and lifecycle regions.
- Keep transform explain output compatible while sharing underlying planning
  facts.

Acceptance:

- representative components receive complete, nonoverlapping semantic regions;
- every task classification has placement, readiness, priority, dependencies,
  effects, cancellation, publication, and inference reasons;
- broad/unknown analysis is not presented as exact; and
- inspection generation performs no file emission.

### Phase 2: structured diagnostics

- Give eXact diagnostics stable codes and precise primary ranges.
- Retain related source evidence through callable and placement propagation.
- Add explanation and consequence projections.
- Associate valid fix summaries without generating edits yet.
- Ensure build and language analysis originate from the same diagnostic facts.

Acceptance:

- placement, render-effect, serialization, secret-flow, unsupported task,
  registry-key, action, and binding errors identify their causal ranges;
- build and editor diagnostic codes agree; and
- no suggested fix contradicts compiler analysis.

### Phase 3: incremental language-service API

- Add document overlays, versions, affected-file calculation, and immutable
  generations to the native project session.
- Add the async native language client.
- Implement `synchronize()`, `inspect()`, cancellation, stale-result rejection,
  and disposal.
- Support configured and inferred projects.
- Expose profiling and bounded session stats.

Acceptance:

- unsaved changes receive correct cross-file analysis;
- no generated files are written;
- a superseded request cannot publish diagnostics;
- configuration changes rebuild the correct project state; and
- repeated open/change/close cycles release overlays and processes.

### Phase 4: language server

- Implement project discovery and multi-root ownership.
- Publish eXact diagnostics.
- Implement semantic tokens full/delta, hover, inlay hints, CodeLens, document
  symbols, and navigation to related reasons.
- Add custom component-semantics and explanation requests.
- Add virtual compiler-separation documents.
- Respect workspace trust and compiler version selection.

Acceptance:

- standard LSP clients can consume diagnostics and semantic classifications;
- the component-semantics request requires no VS Code-specific types;
- editor TypeScript features remain functional; and
- language-server shutdown disposes every native session.

### Phase 5: task refactoring

- Implement inferred-to-explicit task planning.
- Implement explicit-to-inferred eligibility and planning.
- Reanalyze proposed source in memory.
- Compare normalized semantic contracts before returning
  semantics-preserving edits.
- Return explicit semantic deltas for behavior-changing operations.
- Preserve comments and request host formatting after structural edits.

Acceptance:

- conversion round trips representative simple tasks;
- placement, readiness, priority, dependency order, signal behavior, staged
  publication, and diagnostics remain equivalent;
- cleanup, external-effect, nonblocking, manual-dependency, and opaque-signal
  cases are correctly withheld; and
- stale document versions cannot receive edits.

### Phase 6: VS Code extension

- Package and start the language server.
- Register semantic tokens and restrained default styling.
- Add optional region decorations, CodeLens, and important inlay hints.
- Build the component-semantics tree and explanation views.
- Surface diagnostics, related information, quick fixes, and refactors.
- Add semantic-change previews.
- Publish compiler version and project status.

Acceptance:

- a new developer can identify setup, render, inferred tasks, explicit tasks,
  placement, readiness, dependencies, and disposal from the editor;
- every displayed classification links to compiler evidence;
- refactor previews distinguish preserved behavior from intentional change;
- no extension code independently classifies eXact source; and
- the extension works in multi-root workspaces and degrades safely when
  untrusted.

### Phase 7: build inspection preparation

- Add `emitInspection` configuration without implementing Chromium tooling.
- Derive a versioned, server-owned static catalog from source inspection.
- Keep rich catalog data out of client artifacts.
- Define exposure-scoped catalog partitioning for microfrontend producers.
- Verify hardened builds omit the catalog and removable client correlation
  hooks.

Acceptance:

- language-service inspection remains available with `noEmit: true` even when
  build inspection emission is disabled;
- client-bundle inspection finds no names, paths, reasons, or dependency
  descriptions from the server catalog;
- producer catalogs include only exposure-reachable graphs; and
- `emitInspection: false` provides a testable hardened-build guarantee.

## Testing strategy

### Compiler semantic tests

Protect classifications and reasons for:

- setup-once initialization;
- render functions and reactive expressions;
- inferred async tasks;
- explicit task facets;
- blocking and nonblocking work;
- client, server, isomorphic, conflicting, and unknown placement;
- signal injection;
- resources and cleanup;
- derived reactive values;
- actions and concurrency;
- context residency;
- secret qualification; and
- cross-file effect propagation.

Assert stable semantic fields and reason codes. Avoid snapshots of entire
internal analysis records when the supported contract is smaller.

### Diagnostic tests

For every high-consequence boundary, assert:

- stable code;
- primary range;
- related causal ranges;
- explanation category;
- available fixes; and
- parity between build and language-service analysis.

### Refactoring tests

Compile and inspect source before and after each transformation. Protect:

- evaluation count and order;
- dependency order;
- placement;
- readiness;
- priority;
- signal forwarding;
- state publication;
- cleanup;
- exception/finally behavior;
- imports and component async shape; and
- diagnostics.

Use negative tests to prove unsafe conversions are unavailable.

### Language-server tests

Use protocol-level tests for:

- open/change/close overlays;
- changed and affected documents;
- rapid stale generations;
- cancellation;
- semantic token deltas;
- diagnostic replacement;
- multi-root projects;
- inferred projects;
- workspace configuration changes;
- virtual documents;
- refactor version rejection; and
- orderly shutdown.

### VS Code tests

Keep UI automation focused:

- extension activation;
- language-server startup;
- one semantic classification flow;
- one related diagnostic flow;
- one refactor application;
- component-semantics navigation; and
- untrusted-workspace behavior.

Do not duplicate every compiler case through expensive editor automation.

## Documentation work required during implementation

Implementation must update:

- `docs/component-language.md` with language-tool classifications and
  refactoring guidance;
- `docs/scheduling-suspense-activity.md` with inferred/explicit task editor
  presentation;
- `docs/native-compiler.md` with no-emit language sessions;
- a new current `docs/language-tools.md`;
- the docs application route, navigation, search metadata, and complete
  examples;
- the root README and compiler README;
- compiler and new package-local `AGENTS.md` files;
- package manifests and package-content checks; and
- the reusable eXact authoring skill.

Do not document this proposal as implemented until the corresponding behavior
ships.

## Acceptance criteria

The first eXact Language Tools release is complete when:

1. VS Code clearly distinguishes initializer, render, inferred task, explicit
   task, action, derived value, binding, and lifecycle regions.
2. Task presentation includes placement, readiness, priority, dependencies,
   effects, cancellation, publication, signal injection, and disposal.
3. Every inferred classification can show compiler-owned reasons with source
   evidence.
4. eXact build errors appear while typing with stable codes, related ranges,
   explanations, and valid fixes where available.
5. The language server analyzes unsaved files incrementally and emits no build
   artifacts.
6. Stale analysis never replaces a newer editor generation.
7. Inferred-to-explicit task conversion preserves the normalized semantic
   contract.
8. Explicit-to-inferred conversion is offered only when equivalence is proven.
9. The VS Code extension contains no duplicate eXact classifier.
10. Ordinary TypeScript language features continue to work.
11. Workspace and native-process ownership are deterministic and disposable.
12. The static model can later correlate with runtime inspection without using
    dispatch or security identities.
13. Optional emitted inspection data is server-owned, absent from client
    bundles except for opaque correlation needed by enabled inspection, and
    removable from hardened builds.

## Result

The language tools should make eXact's compiler-led model visible at the point
where developers need it most: while reading and changing source.

Inference remains concise, but it is no longer opaque. Explicit forms remain
available, but they are not irreversible ceremony. Diagnostics teach the
framework model instead of merely rejecting code. Refactorings are backed by
the same semantic analysis that will compile the result.

That combination makes the extension more than syntax highlighting: it becomes
the developer-facing explanation layer for eXact itself.
