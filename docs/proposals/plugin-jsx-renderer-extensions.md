# Plugin-owned JSX and renderer extensions

## Status

Proposed. The current plugin protocol supports discovery, configuration,
host-specific entries, namespaced `@exact` directives, module analysis,
manifest data, output processing, and lifecycle resources. It does not yet let
a plugin own JSX attribute syntax, contribute structured compiler lowering, or
participate in renderer element and range lifecycle.

This proposal adds those capabilities for the optional
[`motion` plugin](motion-plugin.md) and future packages with the same
cross-host need. Current behavior remains documented in
[`../framework-plugins.md`](../framework-plugins.md).

## Decision summary

eXact should support plugin-owned JSX directives through a constrained,
declarative compiler contract and bounded renderer lifecycle hooks:

- one configured plugin may own a JSX attribute prefix such as `motion`;
- the owner declares the bare attribute and allowed namespaced members;
- the compiler validates and lowers those attributes into opaque directive
  descriptors attached to existing vnode and range identity;
- plugins do not receive arbitrary AST rewrite callbacks;
- generated code uses a generic core ABI rather than importing a plugin
  runtime;
- renderers expose bounded mount, commit, layout, removal, hydration, and
  disposal hooks;
- required runtime capabilities fail during host preparation;
- compiler syntax provenance and host-specific runtime capability requirements
  are tracked separately;
- mounted directives resolve ordinary reactive component context through their
  logical owner; and
- language tools, SSR, hydration, testing, and DevTools consume the same
  registered namespace and protocol facts.

The framework owns extension transport, deterministic ordering, identity,
cleanup, and safety boundaries. Each plugin owns the meaning of its namespace.

## Why this belongs in the plugin system

A component or context is sufficient when behavior is established explicitly
inside an authored component tree. A framework plugin is warranted when one
feature must participate consistently in:

- TypeScript JSX typing;
- native compiler analysis and lowering;
- DOM commit and removal;
- SSR and hydration;
- client activation;
- language tools and DevTools; and
- deterministic testing.

Motion is the motivating example:

```tsx
<article motion={cardMotion} motion:layout="position" />
```

Hardcoding `motion` into the compiler would make animation a core language
feature. Treating these names as ordinary DOM props would leak them into HTML
and would not provide safe removal retention. A plugin-owned directive gives
the syntax one explicit owner without making animation policy part of core.

## Goals

1. Let trusted plugins add clean, typed JSX attributes without alternate
   component factories or wrapper ceremony.
2. Preserve ordinary eXact component, JSX, binding, range, task, SSR, and
   hydration semantics.
3. Keep generated output compact and independent from a particular plugin
   runtime implementation.
4. Fail before application work when a required host capability is absent
   or incompatible.
5. Give compilerless libraries access to the same runtime behavior through
   shared JavaScript contracts.
6. Let mounted directives consume the same component contexts as authored
   components without adding a second configuration system.
7. Keep plugin execution deterministic, bounded, inspectable, and testable.
8. Avoid dependency cycles between core, renderers, and optional plugins.

## Non-goals

- A Babel-style arbitrary AST transformation API.
- Runtime interpretation of arbitrary source strings.
- Allowing unconfigured packages to claim JSX names opportunistically.
- Letting plugins alter state authority, placement, serialization, security,
  or final DOM semantics outside their declared renderer participation.
- Making every plugin hook asynchronous.
- Treating directive descriptors as DOM attributes or public serialization.
- Replacing explicit components when they express a clearer policy boundary.
- Making compiled plugin-owned JSX portable without its declared plugin
  dependency.

## Architectural boundaries

The dependency direction remains:

```text
@exactjs/plugin-api
        ^
        |
@exactjs/core <--- @exactjs/dom
        ^              ^
        |              |
        +------ optional plugin
```

- `@exactjs/plugin-api` owns browser-safe declaration and projection types.
- `@exactjs/plugin-host` owns discovery, trust, graph ordering, version
  selection, and host activation.
- `@exactjs/compiler` owns parsing, semantic validation, reactive lowering,
  descriptor emission, and source identity.
- `@exactjs/core` owns the opaque compiled descriptor ABI, component and task
  ownership, and renderer-neutral capability declarations.
- `@exactjs/dom` owns DOM-specific directive lifecycle and removal leases.
- SSR renderers own equivalent host projections and may implement a semantic
  no-op where that is the plugin's defined server behavior.
- optional plugins implement their namespace without being imported by core or
  a renderer.

## Plugin declaration

The existing package declaration already separates compiler, render, client,
testing, and configuration-type entries. A plugin using JSX directives
continues to declare those entries:

```json
{
	"exact": {
		"plugin": {
			"schemaVersion": 1,
			"protocolVersion": "1.0.0",
			"configKey": "motion",
			"entries": {
				"config": "./dist/plugin/config.js",
				"configTypes": "./dist/plugin/config-types.js",
				"compiler": "./dist/plugin/compiler.js",
				"render": "./dist/plugin/render.js",
				"client": "./dist/plugin/client.js",
				"testing": "./dist/plugin/testing.js"
			}
		}
	}
}
```

The compiler entry contributes a declarative namespace schema. The render and
client entries claim compatible runtime capability identifiers. Discovery and
trust rules remain unchanged: plugin code executes in process and must be
trusted like build or server code.

A component package that authors plugin-owned JSX declares the plugin as a
dependency and forwards it with `required: true`. This makes the language
feature part of that package's honest runtime contract. A package that wants a
plugin-free base exposes the enhanced components from a separate entry rather
than asking one compiled artifact to tolerate missing infrastructure.

## JSX namespace contract

### Schema

`@exactjs/plugin-api` gains a structured JSX contribution:

```ts
export interface ExactCompilerPluginExtension {
	readonly namespace: string;
	readonly directives?: readonly string[];
	readonly jsx?: ExactCompilerJsxExtension;
	readonly include?: RegExp;
	analyzeModule?(view: ExactCompilerModuleView): ExactCompilerModuleContribution | undefined;
	validateManifestData?(value: ExactJsonValue): undefined;
}

export interface ExactCompilerJsxExtension {
	readonly attribute: string;
	readonly targets: readonly ('html' | 'svg' | 'mathml' | 'component')[];
	readonly members: Readonly<Record<string, ExactJsxDirectiveMember>>;
	readonly protocolVersion: string;
	readonly capability: string;
}

export interface ExactJsxDirectiveMember {
	readonly sourceName: string;
	readonly value:
		| 'boolean'
		| 'expression'
		| Readonly<{ literals: readonly (string | number | boolean)[] }>;
	readonly evaluation: 'stable' | 'reactive-value' | 'callback';
	readonly clientParticipation: 'none' | 'activate';
	readonly lifecycle?: readonly ('mount' | 'commit' | 'layout' | 'remove')[];
}
```

The exact final TypeScript shape may change, but the contract must remain
declarative and bounded. Evaluation and lifecycle declarations tell the
compiler when an authored value participates in existing reactive and client
activation planning; they do not give the plugin a second reactive model. The
plugin cannot replace nodes, manufacture imports, or execute a callback over
the compiler AST.

For motion, `attribute: "motion"` owns both:

```tsx
<div motion={definition} motion:layout="position" />
```

The bare attribute maps to a reserved member such as `default`; namespaced
attributes map to declared members such as `layout`. Namespace ownership is
unique across the prepared registry. A collision fails before compilation.

### Target restrictions

Each extension declares where its attributes are meaningful. The initial
protocol supports intrinsic HTML, SVG, and MathML elements. Component targets
remain disabled until the framework defines whether a directive attaches to:

- the component's whole mounted range;
- one explicitly exported element capability; or
- a component-owned forwarding point.

The compiler must not guess a component's root element.

### TypeScript typing

The plugin's `configTypes` entry augments a framework-owned extension
interface used by intrinsic JSX attributes:

```ts
declare module '@exactjs/jsx' {
	interface ExactIntrinsicExtensionAttributes {
		motion?: MotionDefinition;
		'motion:enter'?: MotionPhase;
		'motion:change'?: MotionPhase;
		'motion:leave'?: MotionPhase;
		'motion:appear'?: boolean;
		'motion:layout'?: boolean | 'position' | 'size';
		'motion:layout-id'?: string;
	}
}
```

Configured plugin types are loaded by the generated application type
environment and by the language server. Merely installing a package does not
claim its namespace. With no configured owner, TypeScript and the eXact
compiler both reject the attributes.

The plugin host validates that the type contribution, compiler schema, and
runtime capability use the same package and protocol identity.

## Compiler lowering

### Structured input

The native compiler already records structured JSX elements and attributes.
The prepared registry projection should pass declarative JSX schemas into the
native process beside the existing namespaced `@exact` directive registry.
Validation operates on parsed JSX nodes, not regular expressions over source.

For each owned attribute the compiler:

1. verifies the target kind;
2. verifies the member name and value form;
3. type-checks the expression normally;
4. preserves reactive dependencies with the same rules as ordinary props;
5. allocates a stable opaque source-site identity;
6. removes the directive from emitted DOM props;
7. attaches one compact descriptor to the existing compiled vnode; and
8. records syntax provenance, client activation, renderer lifecycle, and
   host-specific runtime requirements.

Unknown members, duplicate incompatible members, conflicting plugin ownership,
unsupported targets, and invalid literal forms are diagnostics.

### Emitted descriptor

The renderer-neutral ABI is conceptually:

```ts
export interface ExactCompiledDirective {
	readonly namespace: string;
	readonly protocolVersion: string;
	readonly capability: string;
	readonly site: string;
	readonly values: Readonly<Record<string, unknown>>;
}

export function exactDirective(
	namespace: string,
	descriptor: Omit<ExactCompiledDirective, 'namespace'>
): ExactCompiledDirective;
```

Generated code imports this generic helper from `@exactjs/core`. It does not
import a plugin runtime. Descriptor values may include stable authored values
and compiler-owned reactive cells according to the member schema; they are not
required to be JSON and are never copied into compiler manifests or hydration
payloads without an explicit serialization contract.

The descriptor attaches to existing vnode identity. It does not wrap the
element in another component, alter its key, or create a second reconciliation
tree.

### No duplicated plumbing

Each compiled use contains only:

- namespace and protocol identity;
- a compact source-site identifier;
- authored or lowered values.

Animation drivers, observers, registries, lifecycle algorithms, and task
coordination remain in the one active runtime plugin instance.

## Compile-time and runtime requirements

The current plugin registry fingerprint describes the active compiler registry
as one unit. JSX extensions require more precise artifact facts:

```ts
export type ExactPluginArtifactRequirement =
	| Readonly<{
			packageName: string;
			capability: string;
			protocolVersion: string;
			phase: 'source-transform';
			requirement: 'provenance';
	  }>
	| Readonly<{
			packageName: string;
			capability: string;
			protocolVersion: string;
			phase: 'runtime';
			requirement: 'required';
			hosts: readonly ExactPluginHostMode[];
	  }>;
```

- `source-transform/provenance` records which trusted schema validated and
  lowered source. It participates in compiler cache invalidation.
- `runtime/required` says host preparation must find a compatible
  implementation in every listed host.

Consuming already-lowered JavaScript does not require the source-transform
plugin merely because that plugin authored the descriptor. Recompiling source,
performing source-level whole-program analysis, or accepting an unlowered
package does require it.

Imported-artifact validation should compare individual requirements instead of
rejecting every registry fingerprint difference. The full fingerprint remains
useful as a cache key, not as proof that every plugin must be active at runtime.

## Runtime directive registry

Each renderer creates a directive registry while preparing the application.
The plugin host contributes implementations in deterministic dependency-graph
order. One namespace and capability pair has one active owner.

The registry creates one durable mounted directive instance for each mounted
element or range identity. Conceptually:

```ts
export interface ExactRendererDirectiveDefinition<ElementHandle, RangeHandle> {
	readonly namespace: string;
	readonly protocolVersion: string;
	create(context: ExactDirectiveCreateContext): ExactMountedDirective<ElementHandle, RangeHandle>;
}

export interface ExactDirectiveCreateContext {
	getContext<T>(token: ContextToken<T>): Reactive<T>;
}

export interface ExactMountedDirective<ElementHandle, RangeHandle> extends Disposable {
	mount?(context: ExactDirectiveMountContext<ElementHandle>): void;
	measureBeforeCommit?(context: ExactDirectiveCommitContext<ElementHandle>): void;
	measureAfterCommit?(context: ExactDirectiveCommitContext<ElementHandle>): void;
	applyAfterCommit?(context: ExactDirectiveCommitContext<ElementHandle>): void;
	beforeRemove?(context: ExactDirectiveRemovalContext<RangeHandle>): void;
}
```

These hooks are renderer operations, not application lifecycle callbacks. They
run only at renderer-owned transition points and receive opaque handles where
the plugin does not need platform-specific objects.

`getContext()` resolves ordinary reactive eXact context through the mounted
element's logical component ancestry. A directive uses the same context token,
inheritance, reactivity, and portal semantics as an authored component; the
plugin system does not introduce a separate configuration facility. The
mounted instance and every subscription or resource it owns are disposed with
that identity.

DOM plugins may receive `Element` through an explicitly DOM-specific contract.
Server and non-DOM renderers may provide semantic no-op implementations.

### Commit and layout phases

Layout-sensitive plugins need deterministic transaction phases:

1. renderer plans the ordinary commit;
2. all `measureBeforeCommit` hooks read old layout;
3. renderer applies ordinary mutations;
4. all `measureAfterCommit` hooks read new layout;
5. all `applyAfterCommit` hooks schedule visual work and perform writes;
6. renderer publishes completion;
7. directive child tasks settle independently according to readiness.

Hooks must not replace the renderer's mutation plan. Reads and writes are
structurally separated across the entire renderer transaction to avoid
plugin-specific layout thrashing. Hook ordering is stable, and a plugin may
declare ordering constraints through the existing plugin graph.

### Removal leases

A directive may delay physical removal only through a renderer-owned lease:

```ts
export interface ExactDirectiveRemovalContext<RangeHandle> {
	readonly range: RangeHandle;
	readonly reason: 'conditional' | 'keyed-removal' | 'replacement';
	readonly signal: AbortSignal;
	retain(options: ExactRemovalLeaseOptions): ExactRemovalLease;
}

export interface ExactRemovalLease extends Disposable {
	readonly signal: AbortSignal;
}
```

Acquiring a lease:

- leaves logical application state unchanged;
- marks retained content semantically absent;
- attaches finite work to the ambient task frame;
- keeps renderer and component ownership intact;
- prevents direct plugin DOM removal; and
- releases automatically on cancellation, failure, owner disposal, or explicit
  disposal.

The renderer removes the range only after every current lease is released.
Reinsertion or replacement cancels stale lease generations before reusing
identity. Plugins never receive a public `Promise.all()`-style presence
primitive.

The renderer restores the task frame captured from the update that caused the
removal before invoking `beforeRemove`, so work opened by the directive joins
the correct causal tree. Owner or root disposal does not offer a retainable
removal context: it cancels directive work, disposes the mounted instance, and
removes the range immediately.

The host enforces a bounded retention policy in development and testing so a
faulty plugin cannot retain inaccessible DOM indefinitely.

### Error and cancellation behavior

- Hook errors report through the owning component or renderer error boundary.
- A failed hook releases its leases before reporting.
- Component disposal cancels directive work before destroying its range.
- Superseded generations cannot mutate, release, or remove current ranges.
- Plugins own resources with framework task or component ownership; live
  elements and callbacks never enter inspection snapshots.

## Required capability

Source and component packages that use plugin-owned JSX depend on and forward
the owning plugin. Before application work begins, each host validates the
capabilities required by the compiled artifacts it will execute. A missing or
incompatible implementation fails with package, capability, expected protocol,
host, and provenance information.

Optionality remains at the package and entry-point boundary: an application
that does not use the syntax does not depend on the plugin. Disabling a feature
whose plugin is installed is plugin policy, usually expressed through ordinary
component context, not simulated by removing required infrastructure.

## SSR and hydration

SSR strips directive syntax from HTML. Descriptors do not become public
attributes and their runtime values are not serialized.

Stable compiled element and range identity remains sufficient for hydration:

- the server render projection may intentionally implement a semantic no-op
  while still satisfying the declared server capability;
- the client projection activates directives only in compiler-planned client
  regions;
- both projections validate compatible protocol identity;
- hydration adopts existing element and range identity before mount behavior;
  and
- a missing capability in any required host fails during preparation.

Client-island and distributed-component artifacts carry capability identity
and requirement, not callbacks, definitions, live resources, or source text.
Placement analysis rejects directive values that would improperly move
server-only data or browser-only callbacks across a boundary.

## Compilerless and adapter use

The renderer directive registry and removal lease are shared JavaScript
contracts. A library that cannot use the eXact compiler may:

- render an explicit component that owns a directive descriptor;
- attach a descriptor through a public adapter helper;
- use the same task-aware runtime implementation; or
- expose an imperative API with an ordinary package dependency.

Such code does not get namespaced JSX validation or automatic source identity,
but it must be able to produce the same renderer behavior without imitating
private generated output.

The public adapter creates validated descriptors; callers do not construct
protocol records or renderer leases manually.

## Language tools

The language server uses the same prepared plugin registry and schema as the
build:

- completion lists owned namespace members and literal values;
- hover explains the member, evaluation, lifecycle, and host requirement;
- diagnostics match native compiler validation;
- source inspection associates the descriptor with its decorated element or
  range;
- rename does not treat namespace members as user identifiers; and
- code actions may add plugin configuration but never silently activate a
  trusted package.

Plugin explanations supplement TypeScript hover rather than replacing it.
Decorating an element must not decorate every expression or descendant in its
containing function.

## DevTools

Runtime plugins may contribute a bounded presentation adapter:

```ts
export interface ExactDirectiveInspectionPresenter {
	readonly capability: string;
	summarize(snapshot: ExactDirectiveSnapshot): ExactJsonValue;
}
```

The framework snapshot contains identifiers, lifecycle phase, ownership,
generation, capability, host status, and sanitized plugin state. It excludes
elements, callbacks, raw authored values, animation objects, task tokens, and
secrets.

## Configuration and activation

Activation remains explicit through `exact.config.ts`, a root declaration, or
a required plugin-forwarding declaration from a package that authors the
syntax. Merely installing an unrelated package does not claim a namespace.

The prepared registry must project compatible facts to:

- compiler workers and caches;
- TypeScript and language-tool sessions;
- SSR/render hosts;
- client bundle planning;
- browser bootstrap;
- testing hosts; and
- DevTools metadata.

Server and client projections contain only the configuration required by that
host. Browser projections must not receive server-only plugin configuration.

## Security and resource limits

The existing trust model remains: plugin code is trusted in-process code, not
sandboxed content. The new protocol nevertheless narrows accidental and
cross-boundary risk:

- namespace schemas are deterministic and serializable;
- member counts, descriptor sizes, nesting, and manifest data are bounded;
- compiler callbacks cannot rewrite arbitrary AST;
- directive values follow ordinary placement and secret-flow analysis;
- output escaping and URL policy run after directive processing;
- host capability and protocol requirements are compiler-validated;
- directive context reads use logical component ancestry and ordinary context
  residency rules;
- removal leases are owner-bound, cancellable, and observable; and
- inspection projections are bounded and redacted.

## Testing strategy

Protection should focus on the extension boundary rather than exhaustively
testing trivial schema forwarding.

### Plugin API and host

- namespace collision and protocol mismatch;
- deterministic projection and cache-key changes;
- malformed or oversized schemas;
- host-specific required capability preparation;
- reverse-order resource disposal; and
- server/client configuration isolation.

### Compiler

- bare and namespaced attribute parsing;
- target, member, literal, duplicate, and spread diagnostics;
- reactive value lowering without dependency loss;
- directive-driven client activation without broadening unrelated islands;
- no directive leakage into DOM props;
- stable site identity and source maps;
- imported artifact provenance versus runtime requirements;
- no duplicated plugin-runtime implementation in generated output; and
- server/client placement and secret-flow diagnostics.

### Renderer

- mount, commit, layout, removal, cancellation, and disposal ordering;
- durable mounted identity and logical component-context inheritance;
- several directives on one element;
- deterministic cross-plugin ordering;
- required missing failure before render;
- lease release on success, failure, cancellation, and owner disposal;
- stale-generation fencing; and
- keyed reinsertion and conditional reversal.

### SSR and hydration

Test compatible server semantic projections, client activation, hydration
adoption, and required capability failure in each host. Verify semantic HTML
and identity-preserving adoption rather than exact private descriptor
representation.

### Language tools and DevTools

Test completion, hover composition, diagnostics, source range stability,
context ownership, redaction, and bounded snapshots.

### Reference plugin

Motion is the first high-risk consumer, but a minimal test plugin should
exercise the protocol without animation complexity. This separates framework
contract regressions from Web Animations behavior.

## Delivery plan

### Phase 1: declaration and registry model

- Add JSX schema, evaluation, lifecycle, capability, and artifact-requirement
  contracts to
  `@exactjs/plugin-api`.
- Validate namespace uniqueness, protocol compatibility, resource limits, and
  deterministic fingerprints in `@exactjs/plugin-host`.
- Separate source-transform provenance from host-specific runtime
  requirements.
- Update package README and AGENTS guidance for both affected packages.

### Phase 2: native compiler transport and lowering

- Project declarative schemas into the native compiler process.
- Validate structured JSX attributes and targets.
- Add the compact core directive descriptor ABI.
- Preserve reactive values and existing element/range identity.
- Feed declared client participation into existing island planning.
- Emit per-capability artifact requirements and cache facts.
- Add native/compiler contract and integration tests.

### Phase 3: renderer lifecycle

- Add renderer directive registries, durable mounted instances, ordinary
  context resolution, and deterministic activation.
- Add commit/layout phases and owner-bound removal leases to `@exactjs/dom`.
- Add SSR semantic projections and generic hydration adoption.
- Integrate task ownership, cancellation, errors, and disposal.
- Add fake-renderer, DOM, SSR, and hydration tests.

### Phase 4: tooling and testing hosts

- Load plugin JSX schemas in language-server sessions.
- Add completion, hover, diagnostics, and semantic source entities.
- Add bounded directive inspection and DevTools presentation.
- Add a deterministic testing-host directive driver and minimal reference
  plugin.

### Phase 5: motion validation

- Implement the first `motion` namespace against only the public extension
  contracts.
- Verify that no motion-specific branch exists in compiler, core, DOM, SSR,
  language tools, or DevTools.
- Test compiler, render, client, testing, and missing-required-host
  combinations.
- Measure generated descriptor size and commit overhead.

### Phase 6: documentation and adoption

- Update `docs/framework-plugins.md` and the public docs application when the
  extension ships.
- Update compiler, core, DOM, plugin API, plugin host, language-tools, and
  DevTools README and AGENTS guidance.
- Add package authoring and application activation guides.
- Extend documentation checks and package-content checks for every new public
  entry.

## Intentional changes to current behavior

Implementation will intentionally change these current contracts:

1. Compiler plugins will be able to declare structured JSX attribute
   namespaces, not only `@exact namespace.directive` annotations and raw
   module analysis.
2. The native compiler will accept a bounded JSX schema registry and emit
   opaque directive descriptors.
3. Plugin artifact compatibility will distinguish compile provenance from
   host-specific runtime requirements instead of treating one full registry
   fingerprint as universal runtime necessity.
4. Render hosts will create durable mounted directive instances, expose
   bounded lifecycle phases, and resolve ordinary component context for them.
5. Directive schemas will participate declaratively in existing reactive and
   client-activation planning.
6. DOM removal may be delayed by owner-bound renderer leases while logical
   state remains absent.
7. Configured plugin types will augment intrinsic JSX attributes.
8. Language tools and DevTools will accept deterministic plugin-owned
   presentation data.

No existing plugin gains these capabilities implicitly. Existing plugins and
applications without JSX extensions preserve their current behavior and
generated output.

## Acceptance criteria

The proposal is complete when:

1. only one configured plugin can own a JSX attribute prefix;
2. unknown or malformed plugin JSX fails with source-accurate diagnostics;
3. plugins cannot perform unrestricted compiler AST rewrites;
4. directive attributes never leak into rendered HTML;
5. ordinary reactive bindings, keys, ranges, source maps, and hydration
   identity remain intact;
6. every executing host validates a compatible required capability and fails
   before application work when it is missing;
7. mounted directives have durable identity and resolve ordinary reactive
   context through logical component ancestry;
8. precompiled components do not duplicate plugin runtime machinery;
9. source-transform provenance and runtime requirements are validated
   independently;
10. removal leases cannot outlive their owner or permit stale removal;
11. SSR and hydration use compatible host projections and preserve identity;
12. compilerless adapters can use supported public JavaScript helpers;
13. language tools use the same schema and diagnostics as the compiler;
14. inspection remains bounded, redacted, and free of live resources;
15. motion can be implemented without framework motion-specific branches; and
16. package, compiler, renderer, SSR, hydration, tooling, security, resource,
    and documentation checks pass at risk-appropriate layers.
