# @exactjs/language-server

The eXact Language Server exposes compiler-owned component semantics through
standard Language Server Protocol features. It runs beside ordinary TypeScript
language support and never implements an independent eXact parser or semantic
classifier.

The server owns workspace/project discovery, unsaved document versions,
cancellation and stale-result fencing, LSP projections, and virtual explanation
documents. `@exactjs/compiler` remains the authority for component regions,
placement, task policy, effects, diagnostics, and refactor plans.

Run `exact-language-server --stdio` from an LSP client. Trusted clients should
send `initializationOptions.workspaceTrusted: true`; untrusted workspaces do
not launch workspace compiler binaries or plugins.

Custom requests:

- `exact/componentSemantics` returns the structured component outline.
- `exact/explainEntity` returns one compiler-owned entity and its reasons.
- `exact/previewSemanticChange` returns a version-bound refactor preview.
- `exact/compilerSeparation` returns a read-only conceptual client/server view.
- `exact/projectStatus` returns trust, project ownership, and pinned compiler versions.

The server analyzes in memory. It never emits JavaScript, manifests, maps, or
inspection catalogs.
