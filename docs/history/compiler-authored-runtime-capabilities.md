# Compiler-authored runtime capabilities and portable optional enhancements

## Status

Implemented in August 2026. It is informed by
[`compiler-planned-component-execution.md`](../history/compiler-planned-component-execution.md),
[`compiler-owned-render-programs.md`](../history/compiler-owned-render-programs.md), and
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md).
This proposal generalizes the capability-split client-runtime direction carried by
[`javascript-performance-improvements.md`](../history/javascript-performance-improvements.md) and
[`lazy-interaction-islands.md`](../history/lazy-interaction-islands.md). Those implementations provide the
existing component-local artifact, lazy-chunk, and activation boundaries. This proposal replaces
their capability-specific reachability decisions with one general mechanism rather than adding a
parallel registry or planner.

The two delivery tracks remain independently measurable but are ordered. Track A establishes the
compiled-component capability and initialization contract. Track B uses that contract for explicit
enhancement render nodes and portable optional-provider facades. Track B includes its own Vite,
Webpack, Bun, Node, and component-test adapter conformance; it does not wait for unrelated
microfrontend producer/consumer lifecycle work.

## Decision

The native compiler emits static runtime imports and a declarative component definition according
to the capabilities proven for each compiled component and generated artifact. It compiles that
definition into a reactive state machine; each mounted component owns one durable instance. The
universally imported component kernel must not import optional task, continuation, resumption,
inspection, internationalization, compatibility, or renderer-feature implementations. A
capability's runtime module becomes reachable only when compiled output that requires it imports it.

Ordinary ESM reachability and bundler tree shaking then determine the final client code. This is not
a package-relocation exercise: moving bytes between `core`, `dom`, or another always-reachable
module is not an optimization. A change counts only when an applicable final production bundle is
smaller or when a component instance avoids resources for a capability it does not own.

Enhancements use a distinct contract because their runtime providers are optional to the consuming
application. Author compilation lowers a validated namespaced enhancement application into an
explicit compiler-owned render node. That node imports an exact-specific provider facade which
every build host must resolve. An available facade statically imports the real component; an
unavailable facade exports one shared stateless pass-through provider. A consuming application can
therefore build and render the component without installing or enabling the enhancement package.
Malformed installed providers remain errors.

The same generated resolution contract must operate in Vite/Rollup, Webpack, Bun, native Node ESM
SSR, component tests, and supported server adapters. In-memory virtual modules are an adapter
optimization, not the portable contract; native Node can consume generated physical facade modules
without a custom loader.

## Goals

- Make compiled imports accurately describe the runtime work each component and artifact can
  execute.
- Let standard ESM tree shaking remove complete unused runtime subsystems.
- Avoid constructing a task owner, continuation watcher, inspection publisher, Intl facade, or
  related state for a component that cannot use it.
- Keep the base component kernel small while preserving durable, observable component instances.
- Express state defaults, task definitions, reactive task edges, and render preparation as one
  compiler-owned component definition rather than a linearly executed setup callback.
- Preserve authored barrel imports while allowing compiler output to use focused internal entries.
- Preserve optional enhancement fallback when a provider is unavailable to a bundle or target.
- Represent every enhancement application as an ordinary render-program node before target
  projection, bundling, SSR, hydration, or component testing interprets it.
- Give client, server, test, Vite, Webpack, and Bun builds one logical enhancement decision.
- Keep SSR and hydration behavior compatible when target-specific enhancement implementations
  differ.
- Attribute bundle bytes to the core closure, basic renderer, and optional capabilities separately.
- Produce source-linked explanations for why a runtime module entered an artifact.

## Non-goals

- Moving the same reachable code from `@exactjs/core` to `@exactjs/dom` and claiming a reduction.
- Replacing ESM reachability with a runtime planner that imports every possible capability.
- Requiring authors to select runtime profiles, maintain capability lists, or avoid public barrels.
- Making enhancements required component composition or framework plugins.
- Requiring a consuming application to install a package used only to enhance a compiled component.
- Hiding an installed but invalid, incompatible, or failing enhancement provider.
- Requiring a Node loader for ordinary generated SSR output.
- Defining public protocol identity from generated module paths or bundler virtual IDs.
- Removing generic runtime fallbacks for genuinely opaque, uncompiled, or dynamically extensible
  input.
- Crediting source-line reduction, package tarball movement, or module-count changes without a final
  bundle or instance-allocation improvement.

## Component description and state-machine instances

The outer component function is an eXact authoring form, not a render callback or an ordinary
imperative setup routine. The compiler derives four kinds of information from it:

1. default state values for a new component instance;
2. task definitions and their manual or dependency-driven activation policies;
3. reactive relationships that publish task inputs and trigger eligible task generations; and
4. preparation of the component-local render function and its reactive references.

Application authors can express these facts with ordinary TypeScript because the compiler preserves
their authored dependencies and evaluation semantics. The source must not be documented as a
sequence that is linearly executed. Compiler-defined special forms, including a task function's
`TaskContext` default parameter, refine classification or policy where plain syntax is insufficient.

Generated output contains one declarative component definition. Conceptually:

```ts
const SearchPanelDefinition = {
	state: stateDefaults,
	tasks: taskDefinitions,
	reactive: dependencyEdges,
	render: renderProgram
};

export const SearchPanel = defineCompiledComponent(SearchPanelDefinition);
```

The actual compact representation is private. Mounting creates one state-machine instance with its
state defaults, owned capabilities, dependency subscriptions, and render function. Publications
transition that machine and update only their affected consumers; they do not call the component
again to redescribe its interface. This contract must also hold when ordinary runtime fallback is
necessary: a fallback may interpret the same definition less efficiently, but it may not impose
rerender-loop or linear-callback semantics on compiled components.

### Activation, availability, and placement

“Later execution” is not one runtime event. Generated task machinery uses the following precise
operations:

- **publish** assigns a value and version to a dependency slot. Available `undefined` is a value;
  an unassigned or pending slot is not available.
- **issue** starts one generation only after its activation gate is open and every declared input
  slot is available. The generation receives one atomic snapshot of those inputs.
- **supersede** makes an issued dependency-driven generation obsolete, requests its cancellation,
  and schedules a replacement from the newest complete input vector. Stale completion can never
  publish even when cancellation is not cooperative.
- **invoke** opens a distinct manual or transported activation with its invocation arguments and
  generation identity. Authored `parallel`, `latest`, and `queue` policy governs these invoked
  activations, not a standing reactive activation site.

On the client, each dependency-driven activation site owns a durable watcher. Its first complete
input vector issues the initialization generation. Any later reactive publication to a dependency
supersedes the current generation and issues a replacement after the newest complete vector is
available. Several publications in one reactive transaction coalesce before that snapshot.

SSR uses the same readiness and supersession rules in a request-owned machine. Constants, props,
server contexts, reactive sources, and predecessor continuation outputs populate its slots. A
dependency change during that render supersedes obsolete work; request cancellation or disposal
releases the watcher and every generation it owns.

A post-SSR server continuation does not retain a subscription to browser-owned reactive values.
The client watcher owns those dependencies and sends their compiler-selected, generation-stamped
snapshot with an invocation. The server opens a request-scoped invocation frame, assigns those
transported values to the continuation's non-server-homed input slots, resolves server-homed slots
locally, and opens the invocation gate. Receipt of the request is not itself permission to execute:
the continuation issues only when that gate and every declared slot are available. Its outputs may
then publish directly to downstream server continuations. A newer client generation cancels or
supersedes the prior frame and fences any stale result.

An internal sentinel may represent an unassigned watcher slot so that `undefined` remains a valid
dependency value. It is not serialized, exposed as component state, or used by itself to
distinguish initialization from replacement; activation identity and the last issued version vector
provide that distinction.

### Lazy-island activation scope

Activating an interaction island is a distinct client activation transaction, not a replay of the
page's SSR machine. Loading and adopting the island may require no network request. If activation
invokes server continuations, those invocations belong to a new request-scoped server machine;
compatible operations may be physically batched, but they retain island activation and generation
identity rather than joining the completed page-render request.

The island's generated component region is the execution root. The runtime begins with its declared
live-in slots and already-published SSR, resumption, eager-owner, and shared-context values. It does
not execute a producer merely because that producer exists in the page graph. For each unresolved
live-in slot, it walks backward only through declared producer edges and includes the minimum
transitive predecessor closure needed to make that slot available. It must not issue unrelated
ancestors, siblings, descendants, event tasks, or continuations whose outputs do not feed the
activated island.

This dependency closure cannot violate component ownership. If a required producer is inseparable
from a dormant component outside the island, the compiler must choose one of these explicit
outcomes:

1. widen the generated activation region to include that owner;
2. extract the producer as an independently owned continuation when normal task and lifetime
   analysis proves that separation sound;
3. publish the required value into the island's resumption inputs during SSR; or
4. mark the narrow boundary eager with a source-located explanation.

The runtime must never construct or execute an otherwise dormant outside component as an invisible
prerequisite. Conversely, publication by an activated island may wake a watcher belonging to an
already-active component when that watcher genuinely subscribes to the changed value. That is an
ordinary downstream reactive consequence, not expansion of the island's prerequisite closure.

#### Joining the lazy-island lifecycle

The dependency slice joins the existing generation-scoped island lifecycle in this order:

1. capture the approved event, island identity, target identity, and boundary generation;
2. load the generated client artifact, sharing the boundary generation's one loader promise;
3. validate and adopt the island's authorized DOM, state, context, and resumption inputs;
4. install its durable dependency watchers and populate their live-in slots from the newest complete
   compiler-authorized snapshot;
5. issue the minimum unresolved prerequisite closure and settle activation-blocking generations;
6. commit the boundary generation as active; and
7. replay the accepted event through the installed native handler.

Nonblocking work remains owned by the activated instance but does not delay step 6 or event replay.
An unresolved required live-in is readiness work, not a nonblocking task: the boundary remains in
its existing loading/fallback state until that slot publishes, fails, or its generation is released.
Import, dependency, adoption, and replay failures retain the existing event-family-specific fallback
rules; this proposal does not add an implicit timeout or fabricate a handler.

The activation captures a version vector rather than freezing dependency values when loading
begins. Publications received before issue coalesce into the newest complete vector. A publication
after issue supersedes the affected dependency-driven generation and fences its output. Boundary
replacement, target-generation change, branch or key replacement, root abort, or unmount releases
the complete activation transaction: its watchers, requests, queued events, staged publications,
and late loader or continuation completions cannot commit.

Prerequisite reuse follows normal durable ownership. An already-active producer publishes through
its existing output slot; island activation consumes that value or waits for its current generation
instead of invoking it again. Two activations may join in-flight prerequisite work only when they
refer to the same compiler operation, durable owner, activation site, key, and input-version vector.
Similar function bodies or equal arguments do not authorize deduplication, because separate task
generations may intentionally perform separate effects.

Every statically derived dependency cycle is a compiler diagnostic. A cycle introduced through an
opaque runtime fallback fails the affected activation with a structured dependency-cycle error and
releases its request-owned work; it must not remain permanently loading. Ordinary unresolved
external input may remain pending until publication or lifecycle cancellation.

Resumption and transported inputs retain the ordinary continuation boundary: compiler-declared
serialization, public-data qualification, authorization, freshness, operation allowlisting, server
context resolution, size limits, and generation validation all apply. A narrower activation root
does not grant broader data or execution authority.

Results may publish only to compiler-authorized state, context, output slots, and DOM ranges.
Publication may notify an already-active external subscriber, but it does not activate a dormant
island, move refresh authority, or expand the prerequisite closure forward through unrelated
consumers. Immutable island slice plans may be cached by compiled boundary identity and artifact
generation; input values, restored state, watcher records, task generations, request contexts,
cancellation, and queued events remain activation-owned.

Inspection reports the boundary generation, activation phase, input versions, reused publications,
selected prerequisite closure, issued and joined generations, server exchanges, and any widening,
extraction, SSR-publication, or eager-fallback reason. It must not retain completed activation data
after the normal inspection-history limit or owner release.

## Accounting model

Measurements and build explanations use four ledgers:

1. **Core client closure:** `@exactjs/core` plus reactive or instrumentation modules made reachable
   by the compiled core path.
2. **Basic renderer:** the minimum native DOM client needed by an ordinary compiled application.
3. **Optional capabilities:** enhancements, React compatibility, Intl, advanced tasks, resumption,
   hydration, inspection, optional renderer boundaries, and similar additions.
4. **Application code:** authored and generated application logic, reported separately.

Enhancement packages and enhancement orchestration are never charged to the core closure. If a
non-enhanced application still contains enhancement orchestration, the report identifies
**optional-feature leakage in the renderer**, not core size. An optimization is accepted only when
that leakage becomes unreachable and the complete application bundle falls.

Compressed chunks are not arithmetically additive because chunk wrappers and cross-module
compression change their representation. CI therefore records both isolated ledger fixtures and
complete representative application bundles.

## Required capability imports

Required capabilities are semantic requirements of compiled output. The compiler emits direct
static imports for them. Conceptually, a task-owning resumable component may lower to:

```ts
import { defineCompiledComponent } from '@exactjs/core/runtime/component';
import { attachCompiledTasks } from '@exactjs/core/runtime/tasks';
import { attachResumption } from '@exactjs/core/runtime/resumption';

export const SearchPanel = defineCompiledComponent(definition, {
	tasks: attachCompiledTasks(taskPlan),
	resumption: attachResumption(resumptionPlan)
});
```

A component with neither capability lowers without those imports or properties:

```ts
import { defineCompiledComponent } from '@exactjs/core/runtime/component';

export const StaticPanel = defineCompiledComponent(definition);
```

These names are illustrative internal entries, not proposed public application APIs.

### Inference granularity

The compiler derives capabilities from its existing component, effect, placement, execution,
render-program, and artifact analyses. Initial categories include:

- task definition and invocation;
- task concurrency, priority, optimism, and retained resources;
- server continuation dispatch and dependency watching;
- resumption and hydration ownership;
- runtime inspection instrumentation and publication;
- component-owned Intl lookup;
- React-owned component boundaries;
- component registries and lazy loaders;
- renderer enhancements;
- Activity, Suspense, portal, target, server-slot, unsafe-HTML, and other renderer kinds; and
- generic reactive collection or reconciliation behavior where static proof is sufficient.

Capabilities are attached at the narrowest useful ownership level:

- per component for instance initialization;
- per generated component module for ESM reachability;
- per dynamic artifact or lazy chunk for deferred code;
- per page or server root for renderer/bootstrap assembly; and
- per paired server/client build for hydration agreement.

A root-level union may explain and assemble the entry, but it does not replace component-local
imports. A dynamically imported component brings its own capability imports when its chunk loads;
the root does not eagerly import every capability reachable only through that dynamic edge.

### Generic fallback

Opaque runtime JSX, uncompiled public component values, open registries, or other non-finite input
may require a generic runtime entry. The compiler records the source reason and imports that entry
only for the containing fallback artifact. Proven components elsewhere retain their focused
imports.

## Runtime module boundaries

The component kernel owns only behavior required by every durable instance:

- component identity and logical ownership;
- props and local state roots;
- effect-scope ownership;
- state-machine construction from compiler-authored defaults and render-function storage;
- basic context and error ownership required by all components; and
- deterministic release of integrations attached to that instance.

Optional integrations import the kernel; the kernel must not import their implementations. This
dependency direction is the tree-shaking boundary.

An integration may extend construction through compiler-owned descriptors or small stable internal
interfaces, but it must not introduce a universal registry whose module imports all providers.
Registration functions are useful only when their own import graph remains capability-local.

The compiled component descriptor distinguishes absent capability state from empty capability
state. For example, a component with no tasks has no task integration and no task owner. It does
not allocate an empty owner, empty frame set, status cell, continuation set, or inspection history.

## Canonical enhancement render nodes

Attributed authoring remains unchanged:

```tsx
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };

<Card motion:apply={fade} />;
```

The attributed import remains authoring-only enhancement syntax. While compiling the authoring
source, the compiler resolves its declaration metadata, validates the namespace and distributed
props, and lowers each application into an explicit render-program node. The compiler emits the
canonical provider identity, selected activators/components, props, target ownership, placement,
fallback, and artifact reachability. No later analysis is allowed to reinterpret the namespaced
attribute as another language feature.

Conceptually, the private node contract contains:

```ts
type CompiledEnhancementNode = Readonly<{
	kind: 'enhancement';
	provider: OpaqueProviderIdentity;
	target: RenderNode;
	props: readonly ReactiveInput[];
	composition: 'target' | 'direct-fragment' | 'exported-target';
	fallback: 'preserve-target';
}>;
```

This is a regular render node: reachability, reactive input publication, SSR ordering, hydration,
lazy generations, ownership, and inspection follow render-program rules. Provider selection is the
only optional part. Existing bundle-local enhancement catalog behavior migrates behind this node
and facade contract; catalogs must not remain a second application representation.

Authoring availability and consuming availability are deliberately separate. The authoring
compiler needs a declaration or previously emitted component-library enhancement descriptor to
validate source. Once a library publishes compiled components, its consumers do not need the
enhancement implementation or its package. Published compiled artifacts retain the finite,
type-erased provider and node metadata required by later builds.

Optional consuming availability does not make unknown authoring syntax valid. A misspelled package
with no authoring declaration remains a diagnostic when compiling that source. Conditional runtime
resolution begins only after the compiler has established a valid logical provider identity.

### Authoring compilation boundary

Every authoring entry point consumes one prepared semantic input: source text, resolved package
enhancement declarations, and package-scoped enhancement configuration. The CLI, build adapters,
language service, component-library compiler, and native corpus must not each reproduce attributed
import preparation or namespace arbitration. Project configuration enters the native request as
structured metadata rather than source text appended only by one JavaScript facade.

The native compiler classifies each namespaced attribute exactly once. Enhancement, intrinsic
binding, component value/callback binding, and analysis-only namespaces are mutually exclusive
results in canonical analysis. Component execution, partitioning, render lowering, diagnostics,
and artifact emission consume that result rather than examining the original namespace again.

Published component-library artifacts carry a compact descriptor for every enhancement provider
referenced by their render nodes. Conceptually it contains:

```ts
type PublishedEnhancementRequirement = Readonly<{
	version: 1;
	provider: OpaqueProviderIdentity;
	requestedModule: string;
	requestedExport: string;
	placements: readonly ('client' | 'server')[];
	fallback: 'preserve-target';
}>;
```

The requested module and export are build-time resolution evidence, not runtime protocol identity.
The consuming build joins reachable descriptors with its target package graph and enablement policy
to produce the facade plan. If the request is absent or disabled, it emits the shared pass-through
facade without resolving or evaluating the requested module. If present, trust and compatibility
validation occur before the facade may import it.

## Always-resolvable optional provider imports

Each reachable enhancement node emits an exact-specific compiler-authored import. Its spelling is
private; conceptually:

```ts
import provider from 'exact:optional-enhancement/<opaque-identity>';
```

This import is not an ordinary request for the authored package. The prepared build plan requires
every supported host to resolve it to a generated facade. The facade is physical ESM for portable
Node execution and may be virtualized by Vite/Rollup, Webpack, or Bun.

For each reachable provider identity, the build host produces a facade with one stable default
contract. Conceptually:

```ts
// Available provider facade
export { default } from '@exactjs/motion/runtime';
```

or:

```ts
// Unavailable provider facade
export { PassthroughEnhancement as default } from '@exactjs/core/runtime/optional-enhancement';
```

The pass-through provider is stateless and returns the authored target unchanged. Renderer and SSR
integration recognize its shared identity before component construction. Therefore it creates no
component instance, effect scope, task owner, logical wrapper, DOM marker, hydration record, or
inspection event.

The enhancement render node consumes one provider contract without nullable branches. A
build host may instead erase a pass-through application completely when its optimizer can prove the
same target, identity, hydration, and diagnostic behavior.

The shared pass-through export is a stateless component value so generated render nodes retain one
ordinary shape. Renderer and SSR integration recognize its branded identity before instance
construction. Merely representing absence must not allocate a component, scope, owner, marker,
hydration record, catalog entry, or inspection event.

### Absence versus failure

Optional resolution distinguishes these outcomes:

- **Runtime implementation not installed, disabled by the consuming application, excluded from the
  resolved target graph, or unavailable for the target:** use the pass-through provider after valid
  authoring metadata established the identity.
- **Installed with a declared target-specific pass-through:** use that declared implementation.
- **Installed and valid:** statically import the selected provider export.
- **Installed but malformed, incompatible, unauthorized where authorization is required, or
  failing compilation:** report the existing contextual build error.

Optionality must not swallow syntax errors, invalid exports, incompatible protocol versions,
component-library authorization failures, or evaluation failures from a provider that the build
selected as present.

## Portable provider resolution

The normative cross-host facade and resolution contract is defined in
[`compiler-authored-runtime-capabilities-adapters.md`](compiler-authored-runtime-capabilities-adapters.md).
Every host consumes one prepared provider plan. Physical generated ESM facades are the portable
baseline for native Node; Vite, Webpack, and Bun may use native virtual-module mechanisms when they
remain observably equivalent. Target-specific server and client implementations retain one logical
provider identity and must satisfy the paired SSR/hydration rules in that appendix.

## Tree-shaking and packaging requirements

- Runtime capability entries must be side-effect-free unless their documented purpose is explicit
  registration.
- Package manifests use accurate `sideEffects` declarations or narrow allowlists.
- Public barrels remain supported for authored code.
- Compiler output may use focused exported subpaths whose contracts are internal to the framework.
- A focused entry cannot re-export or import an aggregate entry that makes sibling capabilities
  reachable.
- Type-only capability information must remain erased.
- A central capability enum or explanation table may describe names, but cannot statically import
  implementations.
- Build reports verify actual emitted chunks rather than assuming an unused import was removed.

Generic types do not create separate JavaScript implementations by themselves. Common helpers are
extracted only when emitted bodies are duplicated and controlled minified/compressed measurements
show a final reduction. Cross-package helper movement without a final-bundle reduction is rejected.

## SSR, hydration, and dynamic content

Server roots use the same capability-specific imports as client artifacts. Server-only execution
does not make browser task, compatibility, or renderer code reachable. Client-only components do
not import server continuation executors.

Hydration records identify the logical enhancement/provider decision, not a generated path. A real
client provider may hydrate server pass-through output only when its published enhancement contract
declares that transition safe. Otherwise the paired plan chooses implementations that produce
matching structure.

Dynamic component and enhancement chunks carry their own imports and facade contributions. Loading
one chunk may introduce newly reachable enhancement nodes and provider facades for its generation,
but it cannot mutate an immutable prior build identity or authorize arbitrary authored strings.
Failed or cancelled loads retain the authored unenhanced target and release the candidate
generation.

## Diagnostics and inspection

Build inspection reports, for every included runtime capability:

- capability identity and runtime entry;
- owning component, generated artifact, and source range;
- the analysis fact that required it;
- eager or lazy chunk placement;
- whether a generic fallback broadened inclusion; and
- estimated and measured chunk contribution when available.

Enhancement reports distinguish real, declared pass-through, shared pass-through, excluded by
reachability, and rejected-invalid outcomes. Missing optional providers follow the existing
non-failing diagnostic policy. Diagnostics name the authored provider and source location rather
than generated facade paths.

DevTools observes only instantiated capabilities. A pass-through enhancement does not appear as a
component execution. Build inspection may still explain that the authored optional provider was
unavailable.

## Measurement baseline

The motivating production measurements, attribution limits, counterfactual React result, and
non-additive opportunity estimates are preserved in
[`runtime-capability-bundle-audit-2026-08-10.md`](../performance-baselines/runtime-capability-bundle-audit-2026-08-10.md).
They are directional proposal evidence rather than permanent release budgets. Acceptance uses
counterfactual complete builds and does not sum overlapping estimates.

## Delivery order

The work is implementation-ready in the following order. Each numbered step has a focused
verification gate; a later step must not preserve a temporary competing capability or enhancement
representation.

### Track A: required runtime capabilities

1. Add stable core-closure, basic-DOM, task, resumable, inspection, Intl, React-compatibility, and
   enhancement bundle fixtures with minified and compressed reporting.
2. Emit the canonical component definition with separate state-default, task-definition,
   dependency-edge, and render fields; compile both optimized and ordinary fallback paths from that
   same description.
3. Define the internal component-kernel integration contract and remove reverse imports from the
   kernel to optional implementations.
4. Emit component-local required capability imports and omit task-owner construction for task-free
   components.
5. Split task, continuation, resumption, inspection, Intl, compatibility, and reactive runtime
   entries according to proven reachability.
6. Emit renderer-kind imports and keep the generic renderer as a source-located fallback.
7. Add source-linked capability and bundle explanations.
8. Remeasure representative applications and retain only changes that reduce applicable final
   bundles without unacceptable CPU, heap, startup, or interaction regressions.

### Track B: portable optional-enhancement facades

1. Lower validated attributed syntax into canonical enhancement render nodes and prevent later
   namespaced-syntax reinterpretation.
2. Emit type-erased enhancement descriptors with published component-library artifacts so consumer
   compilation does not require the provider package.
3. Define the exact-specific optional import, prepared facade plan, and branded shared pass-through
   identity; remove the competing catalog application representation.
4. Implement native Node physical facades and component-test facade preparation.
5. Add equivalent Vite/Rollup, Webpack, and Bun resolution without host-specific optionality policy.
6. Add paired SSR/hydration and dynamic-chunk provider generation fencing.
7. Remeasure enhanced and unenhanced applications independently from Track A.

## Verification

- Compiler fixtures prove each capability import appears only for components and artifacts that
  require it.
- Component-definition fixtures prove observable ordering constraints are preserved while state
  defaults, tasks, dependency edges, and render preparation are represented independently of linear
  invocation.
- Activation fixtures distinguish an available `undefined` from an unresolved slot; prove initial
  issue and reactive cancel-and-replace on client and SSR machines; and prove that a transported
  server invocation waits for both its client-supplied and server-homed inputs. Separate invocation
  fixtures retain authored `parallel`, `latest`, and `queue` behavior.
- Lazy-island fixtures prove activation consumes resumed inputs without repeating their producers,
  includes only the backward transitive producer closure of unresolved live-ins, and never executes
  an inseparable dormant outside owner. Each compiler fallback—widening, extraction, SSR
  publication, or eager activation—must remain source-located and deterministic.
- Island lifecycle fixtures cover dependency changes during loading and after issue, blocking versus
  nonblocking readiness, event replay ordering, concurrent islands with shared and distinct owners,
  static and opaque dependency cycles, import and prerequisite failure, replacement, abort,
  unmount, stale server results, output-range authority, and retained-heap release.
- Negative fixtures prove task-free components import no task runtime and allocate no task owner.
- Bundle fixtures inspect final module graphs and minified/gzip/Brotli output for isolated and
  combined capabilities.
- Vite, Webpack, Bun, and native Node SSR fixtures cover present, absent, target-pass-through,
  malformed, incompatible, and unauthorized enhancement providers.
- Published-library fixtures consume a compiled enhanced component without installing its provider
  package and render the unchanged authored target.
- Analyzer fixtures prove enhancement attributes are classified once and cannot fall through to
  component binding or another namespaced language interpretation.
- Entry-point fixtures prove CLI, language service, native corpus, component-library compilation,
  and every build adapter provide identical structured authoring metadata and canonical analysis.
- Server/client paired fixtures cover real browser plus server pass-through, shared absence,
  structural providers, direct `_` composition, target replacement, and hydration recovery.
- Dynamic import tests cover concurrent loads, failure, cancellation, stale generations, HMR,
  provider removal, and disposal.
- Heap tests prove absent capabilities create no placeholder owner, collection, watcher, facade,
  marker, inspection record, or retained generated-plan object per component.
- Public barrel tests remain valid in supported bundlers while generated focused imports preserve
  tree shaking.
- Generic-fallback tests prove opaque input remains correct and explains the broadened capability
  set.
- Cross-target tests prove server-only implementation and secret code never enter client chunks.

## Acceptance criteria

1. The compiler emits one component definition whose state defaults, task definitions, reactive
   dependency edges, and render preparation form a reactive state machine. Each mounted component
   owns one durable instance without treating the outer authoring function as a linearly executed
   render or setup callback.
2. Dependency-driven client and SSR activations issue only from a complete input vector and always
   cancel-and-replace obsolete generations. A transported server activation issues only after its
   invocation gate, client-supplied slots, and server-homed slots are all available; authored
   concurrency remains the policy for distinct invoked activations.
3. Lazy-island activation executes only its generated region and the minimum transitive producers
   of unresolved live-in dependencies. It consumes already-published values without repeating their
   producers and never executes an inseparable dormant component outside that closure.
4. Lazy-island activation adopts and installs watchers before settling blocking prerequisites and
   replaying its event. Changes, replacement, cancellation, failure, and concurrent activation obey
   one generation fence; sharing occurs only for the same owner/site/key/input generation.
5. A compiled component with no tasks neither imports task runtime code nor constructs a task owner.
6. Required capabilities enter generated artifacts through direct static imports at their proven
   ownership boundary.
7. No base runtime module retains optional implementations through an aggregate registry or reverse
   import.
8. Applications using no React-owned boundary, Intl, inspection, resumption, or optional renderer
   kind omit the corresponding runtime modules in final production graphs.
9. Every validated enhancement application becomes an explicit render-program node before target
   projection; downstream phases never reinterpret its authored namespace syntax.
10. Compiler entry points pass package enhancement declarations and configuration through one
    structured authoring-compilation contract; none depends on facade-local virtual source injection.
11. A compiled component carrying valid enhancement metadata builds and renders when the consuming
    application has not installed or enabled that enhancement package.
12. Attributed enhancements with valid compiler metadata but no target runtime provider build and
    render successfully through the shared pass-through contract on Vite, Webpack, Bun, native Node
    SSR, and component tests.
13. The pass-through provider creates no component instance, task owner, effect scope, wrapper,
    marker, hydration record, or inspection event.
14. Installed malformed, incompatible, unauthorized, or failing providers remain contextual hard
    errors rather than silently degrading.
15. Paired server/client facades preserve logical provider identity, authored fallback, structural
    ownership, and hydration compatibility.
16. Dynamically loaded components bring only their own capability modules and release stale provider
    generations correctly.
17. Public barrels remain supported, generated module paths remain private, and no bundler-specific
    identifier becomes protocol identity.
18. Bundle reports keep core, basic DOM, optional capabilities, and application code separate and
    never credit package relocation as a reduction.
19. Representative complete applications demonstrate measured transfer/parse improvements without
    material regressions in mount, hydration, interaction, SSR, retained heap, or build latency.

## Documentation impact on implementation

Current compiler, component-language, performance, enhancement, SSR/hydration, task, and adapter
references now describe the resulting contract. Rejected portable-host alternatives remain recorded in
[`compiler-authored-runtime-capabilities-adapters.md`](compiler-authored-runtime-capabilities-adapters.md).
