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

Keep `this.action()` registrations in setup and preserve compiler-generated action identifiers,
argument slots, generations, placement, and optimistic preludes. Authored labels are diagnostics,
not dispatch names. A server action must not transport its `ActionContext`, DOM values, services,
or secrets.

Keep `createComponentRegistry()` declarations finite, immutable, named, and module-scoped.
Preserve entry provenance, lazy export resolution, placement, artifact targets, and opaque
registry identity through analysis and explanation output. Diagnose an unproven key or ownership
boundary instead of lowering it to an open runtime lookup.
