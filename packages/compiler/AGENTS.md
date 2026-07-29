# Using @exactjs/compiler

Read this package's `README.md` and exported declarations, then inspect the installed integration's
guidance. Prefer a bundler integration over direct compiler orchestration in applications.

Keep source as ordinary TypeScript and let the compiler own reactive lowering. Prefer direct,
clear assignment forms—including chained, compound, logical, tuple, and destructured state
assignments—when they express the intended JavaScript semantics. Use a diagnostic instead of
rewriting valid source around an unsupported or ambiguous form.

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

Request task refactors from the compiler and apply only plans matching the
current generation. Do not reproduce placement, readiness, dependency, signal,
resource, or equivalence analysis in an LSP or editor package. Keep optional
inspection catalogs server-owned and set `emitInspection: false` for hardened
builds.

Keep `this.action()` registrations in setup and preserve compiler-generated action identifiers,
argument slots, generations, placement, and optimistic preludes. Authored labels are diagnostics,
not dispatch names. A server action must not transport its `ActionContext`, DOM values, services,
or secrets.

Keep `createComponentRegistry()` declarations finite, immutable, named, and module-scoped.
Preserve entry provenance, lazy export resolution, placement, artifact targets, and opaque
registry identity through analysis and explanation output. Diagnose an unproven key or ownership
boundary instead of lowering it to an open runtime lookup.

Derive DevTools catalogs and compact runtime correlation from the canonical source inspection; do
not recreate entity ordering in an adapter or UI. The native compiler marks task/action callbacks
with their canonical IDs in instrumented output. Rich classifications, reasons, paths, and source
text belong only to server artifacts. Client output may carry opaque correlation identities and
value-free redaction selectors only. Hardened transforms set both inspection controls to `false`
and must leave no catalog, callback marker, or optional registration.
