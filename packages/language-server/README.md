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

Workspace-folder change listeners are installed only after initialization and
only when the client advertised `workspace.workspaceFolders`. Single-root and
clients without folder-change support continue without that subscription.

Custom requests:

- `exact/componentSemantics` returns the structured component outline.
- `exact/explainEntity` returns one compiler-owned entity and its reasons.
- `exact/previewSemanticChange` returns a version-bound refactor preview.
- `exact/compilerSeparation` returns a read-only conceptual client/server view.
- `exact/projectStatus` returns trust, project ownership, and pinned compiler versions.

The server analyzes in memory. It never emits JavaScript, manifests, maps, or
inspection catalogs.

Important setup, task, and action facts are projected as composable inlay badges
at the end of the relevant authored line. Badge placement never splits a source
token. The vocabulary is `⚙` initialization, `📋` task, `▶` action, `⚡`
compiler-inferred, `🖥` server, `📱` client, `⇄` isomorphic, `⏳` deferred
priority, and `🚨` immediate publication. Each label part has a focused hover,
and the combined hint retains the full compiler classification and inference
reasons.
