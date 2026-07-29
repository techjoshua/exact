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

Each asynchronous request captures an immutable document URI, version, and
source. Results are discarded when the open document has advanced, and
published diagnostics carry the captured version and source coordinates.
Compiler inspection supplies only framework-owned diagnostics; VS Code's
TypeScript service remains the sole presenter of ordinary type errors.

JSX component-tag hovers project the referenced component's compiler-owned
placement and boundary classification. Their hover range is limited to the
authored tag, so a client child rendered by a server parent is identified as the
client child rather than described with the parent's server reasons.

Semantic tokens are limited to identifier ranges whose standard base type
agrees with TypeScript: component functions, explicit task/action methods, and
derived variables. The server deliberately emits no token over keywords,
inferred `await` sites, JSX tags, or whole property accesses, preventing eXact
modifiers from replacing normal syntax highlighting.

Important assignment, task, and action facts are projected as composable inlay
badges at token boundaries. Assignment badges precede the assignment; call
badges follow its opening parenthesis. `⚙` marks a specific initialization and
`⚡` marks a deferred reactive assignment or compiler inference. The remaining
vocabulary is `📋` task, `▶` action, `🖥` server, `📱` client, `⇄` isomorphic,
`⏳` deferred priority, and `🚨` immediate publication.

Hover and optional region projections use entity selection ranges, never the
whole containing initializer or task body. Component CodeLens is a compact
count; operation details remain on their badges and focused hovers.
Explicit-task hover lists only authored activation arguments, while inferred
tasks use compiler-retained authored paths. Callback captures are not presented
as extra task dependencies, and destructured props never appear as a synthetic
`props` identifier.
