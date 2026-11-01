# Compiler-aware language tools

Package-provided diagnostics and editor features use the generic trusted language-extension
protocol documented in
[Language contribution protocol](language-contribution-protocol.md).
Inert declarations cover finite rules. Trusted executable analyzers run in bounded child Node
processes and receive compiler-owned serialized projections, never compiler or LSP objects.

eXact Language Tools makes the native compiler's component model visible while
source is being edited. It runs as a separate language server beside ordinary
TypeScript support: TypeScript continues to own completion, rename, navigation,
formatting, and general type diagnostics; eXact owns component regions,
placement, readiness, effects, ownership, framework diagnostics, and
semantics-aware refactors.

The implementation has five boundaries:

- `@exactjs/compiler` owns source inspection, inference reasons, rich
  diagnostics, refactor planning, equivalence checks, and no-emit project
  sessions;
- `@exactjs/language-server` owns LSP lifecycle, workspace/project selection,
  document overlays and versions, cancellation, stale-result suppression, and
  protocol projection. Negotiated listeners, including workspace-folder
  changes, are installed only after initialization and only when the client
  advertised them; and
- `@exactjs/language-extension-api` owns the versioned declaration, projection, diagnostic,
  completion, hover, hint, and data-only edit contracts;
- `@exactjs/language-extension-host` owns package discovery, independent analyzer trust, child
  processes, limits, policy, and the validation session shared by `exactc`, artifact compilation,
  Vite, Webpack, and Bun; and
- `@exactjs/vscode` starts the local server and presents compiler facts through
  VS Code.

No editor package or provider contains a second eXact parser or enhancement classifier.

Providers that request native compiler analysis retain their host process's V8 memory constraints.
The compiler worker uses a module bootstrap so Node can inherit supported runtime options without
turning process-only flags into invalid worker overrides.

For each document, the language server searches upward from the file for the nearest
`exact.config.*`, stopping at the containing editor workspace folder. That config's directory owns
the compiler session, package-scoped enhancement exports, and language-provider host. Documents in
different applications inside one monorepo therefore retain independent configs and provider
policies. A document with no nested config continues to use the workspace root. Removing a
workspace folder disposes every nested compiler and provider session it owns. Pending document
synchronization, inspections, provider queries, and status requests stop using that project record
after removal, even if awaited work settles later. Disposed managers do not open new sessions.
Closing and reopening a document starts a new synchronization identity, including when the editor
reuses its prior version number. Old results and provider failures do not become current again.

When the editor adds or removes workspace folders, the server captures all current open-document
inputs and reconciles their project ownership. Projects whose input set or construction context
changes are recreated and seeded with current unsaved text before input-dependent queries can use
them. Open siblings in an affected project are seeded together. Compatible independent projects and
nested configs retain their sessions. This does not watch config-content changes outside folder events.

Embedding hosts can call `manager.reconcileWorkspaceFolders({ added, removed }, inputs)` with all
current open `{ uri, version, source }` inputs. The call synchronously returns
`{ affectedInputs, completion }`. `affectedInputs` contains the original input references so a host
can retire affected analysis controllers before awaiting `completion`. That promise resolves to
`{ results, errors }`. The results pair successful current inputs with their synchronization results.
Operational setup, core input, final inspection and cleanup failures appear in `errors` as their exact
thrown values. An errors array containing `undefined` still records a failure. Disposed method entry
continues to throw. These references provide correspondence, while
private project/document identities and the host's actual document lifetime still control publication.
Roots present in both arrays are removed, preserving add-then-remove behavior. Compatible projects
are unchanged when final membership is unchanged.

During project preparation, inspection/refactor queries return `undefined` and provider queries
return empty results. New edits and close/reopen notifications admitted in that interval are ordered
after seeding against the captured service. A superseded queued upsert does not run. Provider
analysis follows core input preparation without becoming part of its input queue. General slow
close ordering outside this interval is not extended by this API.

A failed core preparation removes execution authority and leaves an unavailable project reservation.
Queries do not silently recreate disk-backed input for those known unsaved documents. The operation
settles every owned cleanup before completing its data outcome. Setup/core/finalization errors
precede cleanup errors in stable destination/input order. Resource cleanup keeps its existing
first-error/all-attempts semantics. No error string or aggregate wrapper replaces primitive values.
A later explicit reconciliation with current inputs can reseed the project. An ordinary explicit edit
can recreate its own project input, without automatically reseeding every sibling. There is no
background retry. Cleanup is attempted once. A later operation retiring an unavailable reservation
also records its prior cleanup failure, even if that operation successfully seeds a new project.
Live provider failures retain the existing empty-contribution/status behavior.

Successful current documents are published even when another destination fails. A final inspection
failure does not undo its already seeded input or prevent a successful sibling from becoming ready.
It is distinct from a core/setup failure reservation. Identical membership and the same admitted
version remain a no-op for final inspection alone, without forcing reanalysis. A genuinely newer
explicit input can progress that document. The standard folder callback publishes successful results
before reporting recorded operational errors, then releases all its affected analysis controllers.

Low-level `addRoot(root): void` changes future routing only. `removeRoot(root): Promise<void>` retires
its owned sessions. Neither method receives unsaved source or promises automatic input migration.
Direct hosts with open documents should use the reconciliation method, or explicitly establish fresh
affected contexts and synchronize current inputs before querying. The normal LSP folder callback
uses reconciliation and republishes only actual current document/controller results.

Hosts combining compiler and package inlays can use
`ExactLanguageWorkspaceManager.inspectWithInlayHints(uri, range, signal?)`. The range uses UTF-16
source offsets. This additive manager method inspects once and returns `{ inspection, contributions }`
from the same captured project and accepted document input. It follows `inspect` admission:
a disposed manager rejects, while untrusted or non-file input returns `undefined`. Retirement during
the read also returns `undefined`, so a caller can discard both parts. A live empty provider result
retains the inspection with `contributions: []`. Live provider failures retain that same shape and
record `providerFailure(uri)`. Native inspection errors and explicit cancellation rejections keep
the existing query error behavior.

The standard inlay handler uses this paired read, checks its actual open-document snapshot, then
projects both parts synchronously. Provider-only `inlayHints` remains available for independent
contributions. Ownership is checked when the manager publishes data, without a stronger promise
about later protocol delivery or settings changes during the request. Presentation exceptions
remain outside provider failure handling.

Manager `refactor` also checks its captured project and document before returning a successful plan.
A retired success returns `undefined`. A live success retains the exact plan object. All service
rejections propagate unchanged, including primitive values and retired or cancelled requests.
This check does not bind an earlier independent inspection to a later refactor or establish ownership
of every previously prepared item in an aggregate code-action response.

The VS Code status tooltip shows the resolved project root and active language-provider health.
Provider synchronization refreshes it after analysis, and a provider or host failure changes the
status icon to a warning with the failure message instead of silently suppressing package
diagnostics.

## Package-provided language assistance

A package may publish strict inert metadata under `exact.language`, a trusted analyzer, or both.
Discovery is bounded to packages opted in through an attributed `exact-enhancement` import in the
current document, a `scope: 'package'` enhancement namespace export in the owning `exact.config.*`, or a
selected framework plugin. Ordinary API imports do not activate an enhancement provider, and the
host does not scan every transitive dependency. A local opt-in lets a provider inspect the whole
document, including warning that semantic content has not used the enhancement. A package opt-in
applies that inspection to every compiled component owned by the package. Language trust remains
independent from runtime, build-plugin, and component-library authorization.

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	languageExtensions: {
		analyzers: {
			mode: 'trusted',
			allow: ['@company/design-system']
		},
		ignore: [{ provider: '@company/design-system', roles: ['inlayHints'] }],
		diagnostics: {
			severity: [
				{ provider: '@company/design-system', codes: ['deprecated-tone'], severity: 'warning' }
			]
		}
	}
});
```

The default trusted scope includes framework-owned `@exactjs/` analyzers. Third-party executable
providers require application policy; declarative metadata remains inert. Provider diagnostics,
hover, completions, inlay hints, and source-only code actions merge with core LSP results while
retaining package identity and version. Source-located provider errors reject compiler and official
adapter candidate generations before files or HMR output are published. Provider failures do not
hide TypeScript or core eXact editor diagnostics.

`@exactjs/intl` is a production provider. Hovering an `intl:*` activation shows the exact
native analyzer inference, optional message name, durable message key, placeholder guide, source
locale, target property or content, and the locales whose configured JSON or XLIFF catalogs contain
that key. It also reports invalid messages, configured missing locales, malformed XLIFF, duplicate
or obsolete units, protected-placeholder damage, legacy eXact metadata, and literal formatter
locales that contradict the source locale. Completions cover semantic and concrete units,
currencies, display styles, and translated-property formatter roles; compact inlay hints summarize
inference and coverage. The analyzer and its host are Node-only build tooling and never enter a
browser bundle.

`@exactjs/accessibility` uses the same generic host for finite ARIA names and values, IDs and
relationships, native labels and commands, accessible-name evidence, focus order, modal-dialog
usage, custom interaction parity, live-region conflicts, and the complete composite policies the
package actually ships. It contributes ARIA, role, command, and enhancement completions;
evidence-aware hovers; navigation-policy inlays; and bounded safe edits. Dynamic text, opaque
component output, and runtime-only identity remain explicitly unproven rather than becoming
speculative errors. No accessibility rule or package identity is built into the language server or
compiler.

## Run the VS Code extension from a checkout

The repository launcher builds `@exactjs/language-server` and `@exactjs/vscode`
before opening a fresh Extension Development Host. The extension client bundles
its runtime dependencies beneath the registered extension path and leaves only
VS Code's host API external:

```sh
npm run dev:vscode-extension
```

Use `npm run dev:vscode-extension -- --code code-insiders` for VS Code Insiders,
`--workspace <path>` to open a particular sample, or `--skip-build` while
iterating on already-built output. `--dry-run` prints the exact build and launch
plan. The extension resolves both packaged and npm-workspace-hoisted language
server layouts without creating a package-local dependency link. Development
prefers the freshly built sibling workspace package over any stale installed
copy. Bundling keeps hoisted client dependencies under the extension's runtime
identity, so their VS Code API imports are attributed to eXact Language Tools.
The universal VSIX resolves the native compiler from the owning project root,
using the same `@exactjs/compiler-native-*` package npm selected for that
machine. The extension therefore does not ship a second set of platform
binaries or drift from the compiler used by the repository build.
The opened workspace must be trusted, and opening a TypeScript or TSX file
triggers activation.

## Source inspection

`createExactLanguageService()` creates an isolated, long-lived compiler
workspace:

```ts
import { createExactLanguageService } from '@exactjs/compiler';

const language = createExactLanguageService({
	root: process.cwd(),
	noEmit: true,
	maxCachedAnalyses: 128,
	maxCachedAnalysisBytes: 32 * 1024 * 1024
});

const update = await language.synchronize([
	{
		kind: 'upsert',
		filename: 'src/ProductPage.tsx',
		version: 4,
		source: unsavedEditorText
	}
]);

const inspection = await language.inspect('src/ProductPage.tsx');
await language.dispose();
```

`noEmit` is fixed to `true`. The service retains compiler projects, semantic
graphs, dependency indexes, document overlays, and native analysis in memory. Each inspection
projects separate metadata records. Compiler inspections, explanations, and build facts use readonly
TypeScript fields and ordinary JavaScript records and lists. Session statistics, invalidation results,
and build reports follow the same convention. Editing an observation does not change
retained native analysis or a later inspection. Refactor descriptions also own their returned lists.
The service does not write JavaScript, client/server artifacts, manifests,
source maps, inspection catalogs, or any other generated project file.

Every synchronization returns one monotonically increasing `generation`,
`changedFiles`, `affectedFiles`, and eXact diagnostics. Upserts with an older
document version are ignored. A request observes `AbortSignal` cancellation,
and a result whose document was superseded is rejected before publication.
Closing a document releases its overlay and restores the disk snapshot;
disposing the service releases the native process and all retained project
state.

Disk-backed rich analyses use an access-ordered LRU bounded by both
`maxCachedAnalyses` (default `128`) and `maxCachedAnalysisBytes` (default 32 MiB). Open overlays and
their current analyses are pinned even when editor state alone exceeds those budgets. Cold source
text is reread from disk instead of being retained as a snapshot, while the compact import graph
remains available for affected-file calculation.

`language.stats()` reports overlay count, snapshot entries and source bytes, analysis entries and
estimated bytes, import-graph entries and edges, eviction count, and `cacheOverBudget`. The final
flag can be true when pinned overlays alone exceed a configured limit; the service reports that
condition rather than discarding current editor state.

## Semantic regions

An inspection organizes source by durable component:

```text
ProductPage
├─ Initialization
│  └─ products ← Products context
├─ Tasks
│  └─ Product lookup: inferred, server, blocking
├─ Derived values
│  └─ displayPrice: state.product.price
└─ Render
   ├─ heading text: state.product.name
   └─ price text: displayPrice
```

The public source-entity vocabulary includes components, initializers, render
regions and render expressions, inferred tasks and tasks with authored policy, interactions,
per-write setup assignments, derived values, bindings, context operations, lifecycle
registrations, and registry selections.

Catalog projection, runtime slot correlation, and task searches traverse these trees
iteratively in authored order. Their traversal storage grows with tree depth, and slot
correlation visits each entity once. The native parser determines accepted source nesting.

Each entity has a complete `range`, a small `selectionRange`, compiler-local
identity, children, a normalized classification, and typed inference reasons.
Native UTF-8 byte positions are normalized to the UTF-16 offsets used by
TypeScript and LSP before any range is published, so preceding Unicode text
cannot shift a hover or diagnostic.
Entity IDs are valid only within the owning project generation. They are not
task invocation IDs, continuation dispatch IDs, hydration identities, cross-build
identifiers, package ABI, or authorization capabilities.

Direct setup state writes retain their authored execution classification even
when native normalization lowers a reactive calculation into generated owned
work. `once-per-instance` means the assignment is initialization;
`deferred-reactive` means its right side is reevaluated from reactive inputs.
This classification includes destructured prop bindings and is attached to the
specific state target.

Component and intrinsic value/callback shorthand remains one authored binding entity. Its
classification names the parent state path, value and callback props, callback value type,
additional ignored parameters, placement, artifact targets, and intrinsic adapter when present.
Inspection does not expose generated callback or DOM-helper identifiers as authored entities.

A JSX render expression that resolves to an eXact component retains the native
render edge as `referencedComponent`, including its compiler-local identity,
placement, and boundary classification. Hovering the authored JSX tag therefore
explains the referenced component, such as a client component rendered by a
server parent, instead of falling back to the containing component's placement.
Intrinsic elements and unresolved external component values do not invent this
metadata.

Source ranges are half-open UTF-16 offsets. Task selection accepts a cursor at the start or
inside the task, excluding its trailing end. Touching source spans do not contribute dependencies
or diagnostic causes to one another.

Task classifications expose:

- compiler-inferred or authored-policy origin;
- normalized and requested placement;
- blocking or nonblocking readiness;
- normal or deferred priority;
- ordered dependencies, captured parameter inputs, and effects;
- staged or immediate publication;
- generation cancellation;
- recognized signal injection;
- owned resources; and
- generation or component cleanup.

Dependencies and effects retain source ranges and confidence. Tooling must show
`broad` and `unknown` analysis honestly; it must not render a broad dependency
such as `state.filters.*` as an exact leaf path.

## Reasons and diagnostics

Compiler decisions retain typed reasons such as `awaited-state-flow`,
`initial-render-dependency`, `browser-api`, `server-context`,
`requested-placement`, `recognized-signal-call`, and `owned-resource`.
Propagation paths remain structured related reasons, allowing an editor to
navigate from a task through a called function to the server context or browser
API that determined placement.

Editor diagnostics are projections of the same stable native codes and source
facts used by builds. They add:

- a concise summary;
- a fuller explanation and consequence;
- related causal ranges, including cross-file locations; and
- summaries of fixes the compiler can validate.

Task-related summaries and fixes use current function-defined terminology:
local task functions, setup or invoked activation, and final `TaskContext`
policy. Removed component registration APIs receive no special parsing,
classification, diagnostics, or refactors.

VS Code's TypeScript extension remains responsible for ordinary TypeScript
diagnostics. The extension contributes a narrow TypeScript server compatibility
plugin for syntax whose compiler meaning differs from TypeScript's default model.
Local functions inside a component inherit the authored `this: Component<...>`
receiver for member completion without receiving TS2683, and an attributed
`exact-enhancement` binding counts as used when it appears as a JSX namespace. Typing
that namespace and a colon completes the imported callable's finite public props
in kebab-case, plus the reserved `root` target selector. Unrelated implicit-`this`
and unused-import diagnostics remain unchanged.

An attributed `scope: 'package'` namespace export in `exact.config.*` declares package-wide use;
the binding supplies the virtual namespace for package components even though configuration code
does not reference its runtime value.

After a finite component value prop and colon, the plugin completes compatible notification
callback props whose first required parameter can flow back to the value type. Intrinsics complete
only their supported `onInput`, `onChange`, or `onToggle` endpoints. Hover explains the conceptual
two-prop expansion and parent-owned assignment, and rename follows either namespaced half through
the ordinary prop declaration and other paired uses. A completion or hover that is also a viable
enhancement candidate retains both interpretations; the native compiler issues the authoritative
ambiguity diagnostic.

eXact does not publish a duplicate TypeScript error at the same range. The
language server captures the current document object together with immutable URI, version, and
source text before asynchronous requests. Snapshot checks require that same open document and
version to remain current. Closing and reopening a path creates a new document owner, even when
the editor restarts its version counter, so a previous session cannot satisfy that check.

## Refactoring inferred work and authored task policy

Language-tool refactors are generation-bound compiler plans. The first
reversible transformation converts simple inferred awaited state work:

```tsx
export async function ProductPage(this: Component<ProductState>, props: { productId: string }) {
	const products = this.getContext(Products);
	this.state.product = await products.find(props.productId);
	return () => <ProductDetails product={this.state.product} />;
}
```

to a named task function with its normalized policy authored on `TaskContext`:

```tsx
export function ProductPage(this: Component<ProductState>, props: { productId: string }) {
	const products = this.getContext(Products);
	async function loadProduct(
		productId: string,
		task: TaskContext = TaskContext.server().blocking()
	) {
		this.state.product = await products.find(productId, { signal: task.signal });
	}
	loadProduct(props.productId);
	return () => <ProductDetails product={this.state.product} />;
}
```

The compiler chooses facets, preserves dependency order and evaluation count,
forwards recognized cancellation, and removes component `async` only when no
other inferred await remains. It analyzes the proposed source in memory and
returns no edit when the result has compiler errors.

The reverse transformation is deliberately narrower. It is withheld for
nonblocking work, deferred priority, owned resources or cleanup, external
effects, manual dependencies that cannot be reconstructed, opaque signal use,
authored task identity, unsupported lifecycle behavior, or control flow whose
staging and exception semantics cannot be preserved. Safe simplification is a
refactor opportunity, never a warning.

Clients must reject a refactor when its compiler generation or document version
is stale. Behavior-changing operations identify their semantic delta; a
best-effort textual rewrite is never labeled semantics-preserving.

## Language Server Protocol

Run the server over stdio:

```sh
npx exact-language-server --stdio
```

Standard capabilities carry the common experiences:

| Experience                           | LSP capability                   |
| ------------------------------------ | -------------------------------- |
| eXact compiler errors                | diagnostics                      |
| compatible identifier classification | semantic tokens full/delta       |
| detailed explanations                | hover                            |
| important operation facts            | hoverable inlay badges           |
| compact component summaries          | CodeLens                         |
| semantic outline                     | document symbols                 |
| safe transformations                 | code actions and workspace edits |

Structured custom requests are limited to information that standard LSP cannot
represent cleanly:

- `exact/componentSemantics`;
- `exact/explainEntity`;
- `exact/previewSemanticChange`; and
- `exact/compilerSeparation`.

The compiler-separation result is a read-only virtual explanation document, not
generated JavaScript.

Multi-root clients receive one compiler service per workspace root. A file
outside configured roots receives a bounded inferred project. Workspace removal
and server shutdown deterministically dispose the corresponding native
sessions.

## VS Code

The VS Code extension presents:

- component receiver and enhancement namespace completions through its bundled TypeScript plugin;
- eXact-owned semantic modifiers without replacing TypeScript coloring;
- optional source-operation markers without whole-function decoration;
- concise component CodeLens and operation-local inlay badges;
- provider-authored underlines over source fragments that prove an inference;
- compiler-backed diagnostics and code actions;
- the Component Semantics tree;
- source navigation for inference evidence; and
- the read-only Compiler Separation view.

Presentation settings are independent:

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

These settings never change compiler meaning.
`important` includes compiler operation badges and package inference notes such as intl message
behavior and translation coverage. `off` suppresses all eXact inlays, while `all` also admits any
lower-priority hints providers add later. Changes apply immediately. VS Code's native
`editor.inlayHints.enabled` setting must independently allow inlays. Standard inlay results are
discarded if the open document or its version changes while compiler or provider work is pending,
before source offsets are projected into editor positions.

An analyzer may attach bounded source evidence to an inlay. The VS Code client renders that evidence
as an underline without changing the token's syntax color; hovering it explains the inference and
names the provider. Evidence must be analyzer-proven source provenance, not an editor-side keyword
guess. Disabling eXact inlays also removes these companion decorations.

Semantic tokens are emitted only where eXact can preserve TypeScript's standard
base classification: component declarations remain `function`, explicit task
identifiers retain their ordinary TypeScript classification, and derived names remain
`variable`. eXact does not publish semantic tokens over TypeScript keywords,
inferred `await` sites, JSX tags, or whole property-access expressions. Those
ranges remain entirely owned by TypeScript and the active color theme; eXact
meaning is still available through badges, CodeLens, hovers, and the semantics
tree.

Badges sit beside the operation they classify without splitting a token.
The link badge appears after a derived reactive assignment and before every
symbol-resolved use, making compiler-owned dataflow visible without guessing
from matching identifier text.
Assignment badges appear before the first authored token on the line; call
badges appear immediately after the opening parenthesis. `⚙` identifies a
specific one-time state initialization, while `⚡` on an assignment identifies
a deferred reactive state calculation. `📋` identifies a task, `🖥` server placement,
`📱` client placement, `⇄` isomorphic placement, `⏳`
deferred priority, and `🚨` immediate publication. Normal priority, staged
publication, and authored-policy origin are omitted from the compact badge.

Source hover is similarly precise. eXact responds only on the selected
component, task, interaction, derived value, or JSX tag span; it does not claim the
containing setup or callback body. TypeScript hover therefore remains available
for assignments, variables, parameters, and inner calls. Region markers use
the same selection spans instead of decorating every line in a function.
Function-defined task selection is limited to its authored identifier. An
`await` inside that function is a suspension point of the same task generation,
not an embedded inferred task, so it receives no second task hover or badge.

Task dependency hover describes activation, not every value read while the
body runs. A task with authored `TaskContext` policy lists only its call arguments, once and in
source order. An inferred task lists the compiler-discovered inputs by their
authored paths; destructured prop bindings retain their local names instead of
appearing as a synthetic `props` identifier. Reactive parameter defaults are
listed separately as captured inputs with their parameter position; they do
not appear in the activation dependency list.

## Trust and local-data boundary

The language server is local and does not send source, diagnostics, or
inspection data to a network service. In a trusted workspace, the extension
may launch the installed eXact compiler and read project configuration. In an
untrusted workspace it does not execute workspace binaries or configuration
modules; semantic compiler execution is disabled and the extension identifies
that restricted mode. The compiler has no plugin loading or callback surface.

## Optional build inspection catalog

Editor inspection is always in-memory and independent of build catalog
emission. Direct compiler hosts may request a separate server-owned catalog:

```ts
const result = transformSource(source, {
	filename,
	emitInspection: true
});

storeOnServer(result.inspectionCatalog);
```

`emitInspection` accepts `true`, `false`, or `auto`. `auto` follows the
development default and is disabled when `NODE_ENV` is `production`. The
catalog is returned to the build host and is never embedded in generated
JavaScript. Hardened builds set `emitInspection: false`; language-service
inspection remains available because it uses its separate `noEmit` session.

Microfrontend producer builds use
`selectExactExposureInspectionCatalog(graph, rootComponentId, inspections)` to
retain only components reachable from that exposure. The catalog preserves the
producer's filenames and compiler identities; sibling exposures and unrelated
page-host source are excluded.

Runtime instance events, authorization, redaction, Chromium DevTools, and
microfrontend catalog federation remain outside this static language-tools
package boundary. The implemented runtime projection builds on these source
identities and is documented in [Server-cooperative full-stack DevTools](devtools.md).
