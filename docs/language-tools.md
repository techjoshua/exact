# Compiler-aware language tools

eXact Language Tools makes the native compiler's component model visible while
source is being edited. It runs as a separate language server beside ordinary
TypeScript support: TypeScript continues to own completion, rename, navigation,
formatting, and general type diagnostics; eXact owns component regions,
placement, readiness, effects, ownership, framework diagnostics, and
semantics-aware refactors.

The implementation has three boundaries:

- `@exactjs/compiler` owns source inspection, inference reasons, rich
  diagnostics, refactor planning, equivalence checks, and no-emit project
  sessions;
- `@exactjs/language-server` owns LSP lifecycle, workspace/project selection,
  document overlays and versions, cancellation, stale-result suppression, and
  protocol projection. Negotiated listeners, including workspace-folder
  changes, are installed only after initialization and only when the client
  advertised them; and
- `@exactjs/vscode` starts the local server and presents compiler facts through
  VS Code.

No editor package contains a second eXact parser or classifier.

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
The opened workspace must be trusted, and opening a TypeScript or TSX file
triggers activation.

## Source inspection

`createExactLanguageService()` creates an isolated, long-lived compiler
workspace:

```ts
import { createExactLanguageService } from '@exactjs/compiler';

const language = createExactLanguageService({
	root: process.cwd(),
	noEmit: true
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
graphs, dependency indexes, document overlays, and immutable inspections in
memory. It does not write JavaScript, client/server artifacts, manifests,
source maps, inspection catalogs, or any other generated project file.

Every synchronization returns one monotonically increasing `generation`,
`changedFiles`, `affectedFiles`, and eXact diagnostics. Upserts with an older
document version are ignored. A request observes `AbortSignal` cancellation,
and a result whose document was superseded is rejected before publication.
Closing a document releases its overlay and restores the disk snapshot;
disposing the service releases the native process and all retained project
state.

## Semantic regions

An inspection organizes source by durable component:

```text
ProductPage
├─ Initialization
│  └─ products ← Products context
├─ Tasks
│  └─ Product lookup — inferred, server, blocking
├─ Derived values
│  └─ displayPrice — state.product.price
└─ Render
   ├─ heading text — state.product.name
   └─ price text — displayPrice
```

The public source-entity vocabulary includes components, initializers, render
regions and render expressions, inferred tasks and tasks with authored policy, interactions,
per-write setup assignments, derived values, bindings, context operations, lifecycle
registrations, and registry selections.

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

A JSX render expression that resolves to an eXact component retains the native
render edge as `referencedComponent`, including its compiler-local identity,
placement, and boundary classification. Hovering the authored JSX tag therefore
explains the referenced component—such as a client component rendered by a
server parent—instead of falling back to the containing component's placement.
Intrinsic elements and unresolved external component values do not invent this
metadata.

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

eXact does not publish a duplicate TypeScript error at the same range. The
language server captures immutable URI, version, and source text
before asynchronous analysis. A result is published only if that snapshot is
still the current open document, so a compiler diagnostic cannot appear or
disappear one edit late.

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
