# Using @exactjs/compiler

Read this package's `README.md` and exported declarations, then inspect the installed integration's
guidance. Prefer a bundler integration over direct compiler orchestration in applications.

Keep source as ordinary TypeScript and let the compiler own reactive lowering. Prefer direct,
clear assignment forms—including chained, compound, logical, tuple, and destructured state
assignments—when they express the intended JavaScript semantics. Use a diagnostic instead of
rewriting valid source around an unsupported or ambiguous form.

Write diagnostic fixes in current function-defined task terminology. Never recommend authoring
removed `this.task()` registrations; when compatibility parsing encounters that syntax, identify
it as legacy and direct the author to a local function with final `TaskContext` policy when needed.

Return a local arrow render function normally. A shared regular function is supported when
multiple components genuinely share a view and need their component instance as `this`; do not
return a shared arrow. Keep state writes, registration, scheduling, DOM mutation, and storage
effects out of render functions.

Treat generated `.exact` directories and `.exact.*` files as disposable build output. Never edit
or commit them.

Use `createExactLanguageService()` for editor or agent inspection instead of
looping over `transformSource()`. Keep it `noEmit`, synchronize unsaved overlays
with monotonically increasing document versions, discard cancelled or stale
generations, and dispose the service with its project owner. Treat source entity
IDs as generation-local diagnostic correlation only.
Keep native UTF-8 byte spans behind the language-service boundary and publish
only normalized UTF-16 `ExactSourceRange` offsets.
Project only `EXACT`-namespaced diagnostics into editor source inspection.
Leave ordinary TypeScript diagnostics to the host editor even though the native
build response retains them.
Preserve authored `setupExecution` on direct state assignments across
normalization. Classify destructured prop bindings as reactive inputs and
project assignment entities at their precise state targets.
Keep task selection ranges on their authored function identifier, not the
whole property-access expression. Presentation clients must be able to add
framework meaning without recoloring `this`, punctuation, or adjacent syntax.
Treat awaits inside a function-defined task as suspension points of that task,
not nested inferred-task entities. Retain symbol-resolved derived-binding reads
in source inspection so presentation clients never reconstruct lexical identity
from matching text.
Treat setup-derived declarations as component-owned shared relationships and view-local
declarations as region-owned presentation calculations. Elide an inferred setup cell only for a
safe scalar or forwarded-identity calculation with one eager view consumer. Preserve cells for
shared bindings, fresh identity allocations, deferred handlers, tasks, and explicit
`this.reactive()` values, while retaining the authored definition and references in source
inspection.
For task functions with an authored final `TaskContext` policy parameter, project only authored
call arguments as activation dependencies. Do not promote body reads or captures into
dependencies. Treat the internal `explicit` origin discriminator as compatibility vocabulary, not
as a separate public task model.
For inferred tasks, preserve native authored dependency paths and deduplicate
presentation without changing compiler scheduling.

Request task refactors from the compiler and apply only plans matching the
current generation. Do not reproduce placement, readiness, dependency, signal,
resource, or equivalence analysis in an LSP or editor package. Keep optional
inspection catalogs server-owned and set `emitInspection: false` for hardened
builds.

Preserve native render-edge identity, placement, and boundary facts on JSX
render-expression inspections. Keep the entity range on the element and its
selection range on the authored tag so editor hovers describe the referenced
component without inheriting the containing component's semantics.

Classify ordinary declared, assigned, and expression functions from their activation sites,
effects, and final `TaskContext` policy parameter. Erase policy builders, lower setup activation
through `activateTask(defineTask(...))`, lower invoked facades through `bindTask(defineTask(...))`,
and lower calls after suspension through `invokeTask()` with the retained context. Preserve
compiler-generated opaque operation identity, argument slots, generations, placement, optimism,
and server/client artifact partitioning. Authored function names are labels, never dispatch
authority. Treat an authored final `TaskContext` as the server continuation's runtime context; do
not append a second executor context parameter or expose the authored context as a callable task
argument. Do not transport `TaskContext`, DOM values, services, resources, or secrets.
Preserve automatic generation-signal injection for discoverable direct and options-object
`AbortSignal` parameters, combining authored values instead of replacing them. Give only local,
non-escaping known or typed disposable resources automatic generation ownership; diagnose an
escape and leave opaque cleanup explicit.

Treat defaults on non-context task parameters as captured argument initializers. Resolve omitted
defaults once per generation under the runtime's untracked capture scope, preserve left-to-right
default semantics and explicit-argument tracking, erase the initializers from executable task
work, and expose captured inputs separately from activation dependencies. Resolve captures before
remote dispatch and retain compiler-authorized argument slots across both artifacts.

Keep `createComponentRegistry()` declarations finite, immutable, named, and module-scoped.
Preserve entry provenance, lazy export resolution, placement, artifact targets, and opaque
registry identity through analysis and explanation output. Diagnose an unproven key or ownership
boundary instead of lowering it to an open runtime lookup.

Derive DevTools catalogs and compact runtime correlation from the canonical source inspection; do
not recreate entity ordering in an adapter or UI. The native compiler marks task functions
with their canonical IDs in instrumented output. Rich classifications, reasons, paths, and source
text belong only to server artifacts. Client output may carry opaque correlation identities and
value-free redaction selectors only. Hardened transforms set both inspection controls to `false`
and must leave no catalog, callback marker, or optional registration.
