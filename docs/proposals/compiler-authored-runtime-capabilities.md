# Compiler-authored runtime capabilities and portable optional enhancements

## Status

Deferred outside the established proposal sequence. It is informed by
[`compiler-planned-component-execution.md`](../history/compiler-planned-component-execution.md),
[`compiler-owned-render-programs.md`](../history/compiler-owned-render-programs.md), and
[`enhancements-as-component-composition.md`](../history/enhancements-as-component-composition.md).
This document preserves design and measurement direction without changing another proposal's
prerequisites, describing current behavior, or establishing a release commitment.

This proposal generalizes the capability-split client-runtime direction carried by
[`javascript-performance-improvements.md`](../history/javascript-performance-improvements.md) and
[`lazy-interaction-islands.md`](../history/lazy-interaction-islands.md). The lazy-island stage retains ownership
of the capability splitting required for its delivery. If this broader proposal is implemented
later, it must generalize those boundaries rather than introduce a second capability mechanism.

The roadmap review also separates two independently deliverable tracks in this document. Focused
compiler imports and omitted per-instance owners can be measured without changing enhancement
resolution. Portable optional-enhancement facades require the shared adapter lifecycle and should
follow Webpack/Bun microfrontend parity rather than making that parity depend on this deferred
proposal.

## Decision

The native compiler emits static runtime imports and instance initialization according to the
capabilities proven for each compiled component and generated artifact. The universally imported
component kernel must not import optional task, continuation, resumption, inspection,
internationalization, compatibility, or renderer-feature implementations. A capability's runtime
module becomes reachable only when compiled output that requires it imports it.

Ordinary ESM reachability and bundler tree shaking then determine the final client code. This is not
a package-relocation exercise: moving bytes between `core`, `dom`, or another always-reachable
module is not an optimization. A change counts only when an applicable final production bundle is
smaller or when a component instance avoids resources for a capability it does not own.

Enhancements use a distinct contract because attributed enhancement imports are optional at bundle
time. Build hosts conditionally resolve compiler-emitted enhancement provider facades. An available
provider facade statically imports the real component; an unavailable provider facade returns one
shared stateless pass-through provider. Missing optional providers never fail compilation or
rendering. Malformed installed providers remain errors.

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
- Keep the base component kernel small, setup-once, observable, and independently usable.
- Preserve authored barrel imports while allowing compiler output to use focused internal entries.
- Preserve optional enhancement fallback when a provider is unavailable to a bundle or target.
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
- Hiding an installed but invalid, incompatible, or failing enhancement provider.
- Requiring a Node loader for ordinary generated SSR output.
- Defining public protocol identity from generated module paths or bundler virtual IDs.
- Removing generic runtime fallbacks for genuinely opaque, uncompiled, or dynamically extensible
  input.
- Crediting source-line reduction, package tarball movement, or module-count changes without a final
  bundle or instance-allocation improvement.

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
- setup invocation and render-function storage;
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

## Optional enhancement imports

Attributed authoring remains unchanged:

```tsx
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };

<Card motion:apply={fade} />;
```

The attributed import remains compile-only enhancement syntax. The compiler emits canonical
provider identity, selected activators/components, props, target ownership, placement, and artifact
reachability. It does not turn an optional enhancement into an ordinary required package import.

Optional runtime availability does not make unknown authoring syntax valid. The compiler still
needs a resolvable enhancement declaration or previously prepared package metadata to type-check
the namespace, activators, and props. A misspelled package with no declaration remains an authored
diagnostic. Conditional resolution begins after the compiler has established a valid logical
provider identity; the target runtime implementation may then be absent from a particular bundle.

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

Compiled enhancement application can consume one provider contract without nullable branches. A
build host may instead erase a pass-through application completely when its optimizer can prove the
same target, identity, hydration, and diagnostic behavior.

### Absence versus failure

Optional resolution distinguishes these outcomes:

- **Runtime implementation not installed in the resolved target graph or unavailable for the
  target:** use the pass-through provider after valid authoring metadata established the identity.
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
one chunk may extend the bundle-local enhancement catalog for its generation, but it cannot mutate
an immutable prior build identity or authorize arbitrary authored strings. Failed or cancelled
loads retain the authored unenhanced target and release the candidate generation.

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

The two tracks have separate entry gates. Track A may begin after a fresh bundle/allocation
measurement; Track B begins only after the shared Webpack/Bun adapter lifecycle is complete.

### Track A: required runtime capabilities

1. Add stable core-closure, basic-DOM, task, resumable, inspection, Intl, React-compatibility, and
   enhancement bundle fixtures with minified and compressed reporting.
2. Define the internal component-kernel integration contract and remove reverse imports from the
   kernel to optional implementations.
3. Emit component-local required capability imports and omit task-owner construction for task-free
   components.
4. Split task, continuation, resumption, inspection, Intl, compatibility, and reactive runtime
   entries according to proven reachability.
5. Emit renderer-kind imports and keep the generic renderer as a source-located fallback.
6. Add source-linked capability and bundle explanations.
7. Remeasure representative applications and retain only changes that reduce applicable final
   bundles without unacceptable CPU, heap, startup, or interaction regressions.

### Track B: portable optional-enhancement facades

1. Define the prepared optional-enhancement facade plan and shared pass-through identity.
2. Implement native Node physical facades over the settled shared adapter contract.
3. Add equivalent Vite, Webpack, and Bun resolution without host-specific optionality policy.
4. Add paired SSR/hydration and dynamic-chunk provider generation fencing.
5. Remeasure enhanced and unenhanced applications independently from Track A.

## Verification

- Compiler fixtures prove each capability import appears only for components and artifacts that
  require it.
- Negative fixtures prove task-free components import no task runtime and allocate no task owner.
- Bundle fixtures inspect final module graphs and minified/gzip/Brotli output for isolated and
  combined capabilities.
- Vite, Webpack, Bun, and native Node SSR fixtures cover present, absent, target-pass-through,
  malformed, incompatible, and unauthorized enhancement providers.
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

1. A compiled component with no tasks neither imports task runtime code nor constructs a task owner.
2. Required capabilities enter generated artifacts through direct static imports at their proven
   ownership boundary.
3. No base runtime module retains optional implementations through an aggregate registry or reverse
   import.
4. Applications using no React-owned boundary, Intl, inspection, resumption, or optional renderer
   kind omit the corresponding runtime modules in final production graphs.
5. Attributed enhancements with valid compiler metadata but no target runtime provider build and
   render successfully through the shared pass-through contract on Vite, Webpack, Bun, native Node
   SSR, and component tests.
6. The pass-through provider creates no component instance, task owner, effect scope, wrapper,
   marker, hydration record, or inspection event.
7. Installed malformed, incompatible, unauthorized, or failing providers remain contextual hard
   errors rather than silently degrading.
8. Paired server/client facades preserve logical provider identity, authored fallback, structural
   ownership, and hydration compatibility.
9. Dynamically loaded components bring only their own capability modules and release stale provider
   generations correctly.
10. Public barrels remain supported, generated module paths remain private, and no bundler-specific
    identifier becomes protocol identity.
11. Bundle reports keep core, basic DOM, optional capabilities, and application code separate and
    never credit package relocation as a reduction.
12. Representative complete applications demonstrate measured transfer/parse improvements without
    material regressions in mount, hydration, interaction, SSR, retained heap, or build latency.

## Documentation impact on implementation

When implementation lands, update the current compiler, component-language, performance,
enhancement, SSR/hydration, React compatibility, task, and adapter references. Public docs should
describe observable optional-provider behavior and bundle explanations only after every advertised
host meets the conformance contract. Move this proposal to `docs/history` once those current
references become authoritative. Rejected portable-host alternatives remain recorded in
[`compiler-authored-runtime-capabilities-adapters.md`](compiler-authored-runtime-capabilities-adapters.md).
