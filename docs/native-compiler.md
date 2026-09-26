# Native compiler

`@exactjs/compiler` is the JavaScript process host and public API for the native `exactc` compiler. Parsing,
checking, eXact analysis, placement, policy enforcement, artifact partitioning, lowering,
generated-code validation, and printing execute in one persistent native TypeScript process.
After analysis and target transforms settle, the JavaScript artifact host stages the complete
client, server, shared, source-map, and inspection set before publication. A filesystem failure
restores the prior generation instead of leaving target files mixed. Semantic work and
deterministic diagnostics remain single-owned by the retained native session.

There is no JavaScript compiler fallback and no public backend selector. Native failures remain
visible instead of silently changing compiler semantics.

## No-emit language sessions

`createExactLanguageService()` owns a persistent editor-oriented project in the
pinned native compiler. Unsaved `upsert` changes overlay disk files by document
version, `close` releases an overlay, and `delete` removes the source from the
retained project. Each synchronization publishes one immutable generation with
changed files, affected dependents, and eXact diagnostics.

The language transport is asynchronous and serializes semantic mutations
without blocking the language server's JSON-RPC loop. Cancellation fences
native results even when a compiler phase cannot yet be interrupted internally,
and document-version checks prevent an older response from replacing newer
editor state. Disposal releases overlays, dependency indexes, pending work, and
the native process.

Language sessions are permanently `noEmit: true`: they never write JavaScript,
target artifacts, source maps, or inspection catalogs. Source
entities, typed reasons, rich diagnostics, and refactor plans are in-memory
projections of the same native component and placement analysis used by builds.

Build source maps preserve the native compiler map through later framework prefixes by composing
an exact generated-to-compiled suffix map. Host `moduleTransform` callbacks must return a version
3 map whenever they change code with source maps enabled; an unmapped rewrite is rejected rather
than approximated line-for-line. Vite, Webpack, and Bun recovery paths use token-position mappings
and leave generated-only regions unmapped.
Compiler process protocol 1.0.0 and component-contract version 1 carry the normalized recursive
partition plan, including ordinary enhancement-component owners, structural templates,
crossing-edge data slots, source evidence, and partition-derived range contracts. It also retains
`setupExecution` on authored state assignments across source normalization, distinguishing
one-time initialization from deferred reactive calculation. Analysis responses remap those
assignment spans to the original source before returning them to the language service. Paired
component and intrinsic bindings are preserved as authored `valueBindings` edges with their parent
state path, endpoint props, callback value type, placement, artifact targets, and intrinsic adapter
identity; generated helper names never replace that source-facing description.
See [Compiler-aware language tools](language-tools.md).

The native source is pinned from Microsoft’s main `TypeScript` repository, in its `tsc` Go module.
See [release readiness](release-readiness.md) for the upstream pin, ABI baseline, and publication
checks. The local `native/typescript-go` directory name is retained for repository continuity.

## Application and compiler TypeScript versions

New applications use TypeScript 7 for editor support and `exactc --check --project tsconfig.json` for compiler-aware
application checking. The compiler owns its pinned native TypeScript revision independently of
the application’s `typescript` dependency.
Application source does not import a compiler API, and it does not need TypeScript 6 to run the
eXact compiler.

Some build-time compatibility packages still use the TypeScript 6 programmatic API for their own
bounded jobs, such as configuration loading or React source transformation. That dependency is
not an alternative eXact compiler backend.

## npm distribution

The `@exactjs/compiler` tarball contains the JavaScript host, public contracts, CLI, and compiler
orchestration. It declares six optional platform packages:

- macOS ARM64 and x64;
- Linux ARM64 and x64; and
- Windows ARM64 and x64.

Each platform package declares npm `os` and `cpu` constraints. npm therefore installs only the
package matching the current machine. The host package does not contain six executables.

Set `EXACT_COMPILER_EXECUTABLE` only when a hermetic build or compiler-development workflow must
provide an explicit executable. No deprecated compiler-name environment alias is accepted.

## Library builds

`exactc build-library` and `buildLibrary()` from `@exactjs/compiler/library-build` own the
library packaging pipeline: declaration emission, paired unbundled modules, optional-enhancement
facades, export validation, and static package metadata. See
[library build configuration](component-library-trust.md#build-a-component-or-enhancement-library).
The JavaScript TypeScript API supplies declaration emission only; eXact analysis and lowering
remain native compiler responsibilities. The repository build uses the same builder after its
TypeScript project build, without changing the package artifact contract.

## Public integration

When emitted code reaches an optional enhancement, `compileFile` and `compileProject` prepend its
artifact-local registration and materialize a provider facade under the output's
`.exact/enhancements` directory. Emitted modules import that ordinary ESM file, never an `exact:`
scheme, so unbundled Node SSR needs no custom loader. Provider resolution happens during
compilation, not per request; absence selects the shared pass-through, while malformed installed
exports fail when the generated module is linked.

Newly generated physical facades also retain their validated optional-provider request in a
compiler-owned first-line marker. When a published component library is bundled by an eXact build
adapter, the adapter reselects that provider in the consumer installation instead of retaining the
publisher's availability decision. The same authorization and absent-provider rules apply as for
portable paired requests. This metadata is additive and does not change runtime helper signatures.
Libraries produced without the marker must be rebuilt to gain consumer-side reselection; ordinary
unmarked ESM re-exports are not reinterpreted as optional imports. Shared adapter support restores
compiler-marked facades to consumer-owned optional edges and classifies absent-module errors.
Bun and Webpack also share the Node-style package-presence check used when a host resolver
does not distinguish an absent package from a missing entry file in an installed package.
Vite, Bun, and Webpack use these same contracts. Missing nested dependencies and invalid installed
providers remain failures rather than silently disabling an enhancement.

Paired `compileFileArtifacts` / `compileProjectArtifacts` output is portable build input. Each
module carries registrations and `exact:optional-enhancement` requests. Consume enhanced paired
output through the eXact Vite, Bun, or Webpack adapter, which resolves those requests in the consuming module's
scope and target. It applies server authorization before loading providers. Missing providers use
the shared pass-through; explicitly excluded optional providers follow the configured exclusion
policy. A failed authorization does not become an absent provider. The producing machine does
not select or freeze the consuming application's optional dependencies.

Paired artifacts with component or enhancement imports also retain protocol-1 importer facts in an
inert `exact:component-build` comment. These facts follow target module aliases and binding
replacements; they carry no authorization decision or producer filename. Build adapters read and validate
them before skipping executable recompilation, then authorizes those imports and bundles approved
compiled component entries through its optional-provider resolver. The appended comment preserves
existing source-map positions. Keep this metadata until adapter consumption and regenerate older
paired artifacts to gain this preflight coverage. Runtime helper signatures are unchanged.

These portable requests are not native Node module specifiers. For unbundled Node execution, use
single-target `compileProject` output with its physical facades, include those facades in the
output distribution, and render through `@exactjs/ssr/enhanced` to supply the registered catalog.
Keep authored relative dependencies available or compile them into the output graph. Paired
project compilation rewrites local provider requests to the matching target artifacts when those
providers belong to its plan; other relative requests retain their original source destination.
Linkage and adjusted source maps publish in the same transaction as the paired code.

For client artifacts, each provider facade also imports the DOM enhancement integration. The
integration registers a versioned realm capability synchronously, so bundlers place it with the
static, lazy, or microfrontend module that selected the provider rather than forcing it into every
application entry. Server facades continue to select the SSR catalog facade and do not import DOM
code. Build adapters must preserve the client facade's registration side effect.

Component capability planning uses the same native-component resolver as JSX receipt emission.
Host-classified imports, published component build facts, source declarations, and finite registry
identities therefore select consistent constructors and child operations. An unresolved preliminary
render edge does not by itself require compatibility or task support. This prevents a native package
child, such as `IntlMessage`, from selecting a task constructor without a task-runtime import.
Regression coverage builds the Intl workload and mounts, updates, server-renders, hydrates, and
disposes it in a fresh process, where unrelated tests cannot supply missing registrations.

Applications normally compile through `@exactjs/vite-plugin`, `@exactjs/webpack-plugin`, or
`@exactjs/bun-plugin`. The `exactc` CLI supports precompiled pipelines. Direct tooling can use
`createCompilerSession`, `transformSource`, and the artifact-planning APIs from
`@exactjs/compiler`.

Each transform result reports `runtimeDependencies`, the bare package specifiers that remain in
the final target-local module after lowering and pruning. Published-package builds validate those
facts against `dependencies`, `peerDependencies`, and `optionalDependencies`; a generated DOM or
SSR import can therefore never be hidden behind a development-only workspace installation. The
monorepo discovers packages requesting target-local compilation from their manifests rather than
maintaining a second ordered package list.

Precompiled pipelines treat `rootDir` as an output-containment boundary. Every input must resolve
beneath that root before the compiler derives a path under `outDir`; an outside input fails without
writing through `..` segments or an absolute path.

The Vite adapter authorizes each optional provider in its importing component's scope, then gives
equivalent resolved facades one content-derived module identity. Compiler-selected narrow SSR,
DOM root, and hydration entries use the same catalog-supplying facades as their public entry points. Components that select the same
provider therefore share one browser module without weakening package-scoped authorization.

`exactc --check --project tsconfig.json` is the no-emit application type-check path. It analyzes and lowers each
transformable project module before TypeScript semantic validation, so compiler-owned TSX is
checked as the ordinary props and callbacks it produces. Untransformed TypeScript modules are
still checked directly. Raw `tsc --noEmit` remains useful for packages that contain no eXact-owned
source syntax, but it is not authoritative for an eXact application. The current directory's
`tsconfig.json` is used automatically; `--project` selects a different configuration.

A compiler session owns one persistent native process. Bundler integrations retain the session
for their lifecycle, invalidate its project state after file changes, report project-wide native
diagnostics, and dispose it when the build closes. Vite, Webpack, and Bun share one tool-neutral
transformation kernel for JSX ownership, React compatibility selection, native compilation,
inspection controls, instrumentation, source results, and contextual failures. Resolution, HMR,
asset emission, and build-tool lifecycle behavior remain adapter-owned.

Native process disposal waits for confirmed child exit, escalating an unresponsive termination
after 250 milliseconds. Asynchronous disposal is idempotent and also settles queued requests;
a replacement process starts only after its predecessor exits. Synchronous disposal waits for the
worker's exit acknowledgement and throws if that acknowledgement cannot be obtained within the
shutdown deadline. It does not terminate the owning worker while child cleanup remains pending.

Bun component tests run with `bun --conditions=browser test` so dependencies resolve their compiled
client artifacts before `@exactjs/bun-test/preload` executes. A preload can register the compiler
and DOM environment, but it cannot retroactively change export conditions for its own imports.

Process startup is provisional until the worker starts and the native protocol/version handshake
completes. Any startup, timeout, or negotiation failure closes the worker and its child process
before the error escapes. Native JSX lowering receives one immutable analysis plan, prepares its
derived binding indexes once, and retains a single source traversal; lowering stages should extend
that plan instead of restoring a broad positional-argument boundary or adding extra tree walks.

Generated operation identifiers, ephemeral module analysis, helper imports, and lowered source
are compiler-session details. Applications should depend on authored TypeScript behavior and
documented executable runtime contracts rather than generated representation.

### Helper state effects

Callable analysis retains receiver bindings before project imports are linked. A parameter effect
is relative either to the parameter value (`receiver.root: 'value'`) or its `state` member (the
existing omitted-root form). Each call site's argument path maps those effects into its caller;
ordinary object effects do not become component state authority without a proven receiver.
Receiver paths participate in the incremental analysis fingerprint. Strongly connected callable
groups identify recursive edges before effect propagation. A recursive call into a nested receiver
retains its argument prefix and widens the suffix to an unknown wildcard, preventing branching
recursion from enumerating exponentially many paths. Whole-receiver recursion and acyclic helper
calls retain precise effects. The 32-segment depth bound remains a fallback. Unknown recursive
writes cannot grant finite remote write authority. Literal property boundaries remain distinct
during analysis.

### Portable build analysis

Project-wide callable facts retain their source-file ownership. Artifact pruning and call-effect
lookup may use source offsets only after selecting the owning file. An unrelated module initializer
included by `tsconfig.json` cannot remove another module's exports or change its component placement.
Real imported call edges still propagate their environment requirements across files.

Dependency discovery includes static declarations, re-exports, and string-literal or
no-substitution-template `import()` calls. Deferred imports retain their own facet rather than
becoming eager side-effect imports. Artifact expansion and alias rewriting use these same native
facts, so relocated paired outputs include and resolve their lazy JSX dependencies. Computed
module names are not treated as statically enumerable edges.

Although the complete module analysis is owned by a compiler session, a stable build-facing subset
crosses the compiler/bundler boundary. `ExactModuleAnalysis.packageName` carries the package identity
provided by the build integration. Its `components` and `partitionPlan` entries carry canonical
component ownership, placement, environment effects, and concrete client/server artifact
reachability. `rendererEnhancements` carries canonical enhancement identity plus the module
specifier and export needed to construct a bundle-local enhancement catalog.
Package-scoped config bindings are appended as host-owned virtual imports after authored source;
the protocol boundary preserves authored offsets, duplicate-identifier ownership, and demand-driven
catalog filtering without teaching the native compiler how to execute project configuration.
Finite enhancement props documented with `@exact analyzer-only` remain typed language-projection
facts but do not select renderer enhancements, create activation records, or enter emitted JSX.
Their package-specific interpretation stays outside the compiler.
Binding analysis recognizes those declared fields as enhancement-owned syntax, while retaining the
usual ambiguity diagnostic when the same namespaced attribute is also a valid component or form
binding.

This is the sole compiler-provided seam for component-library authorization. It is deliberately
descriptive rather than authoritative: the compiler does not read the component-library marker,
trust configuration, lockfile, aliases, or resolved physical package graph. A server bundler must
join these facts to its own resolved graph and enforce one policy before evaluating admitted server
modules. Client-only component code remains distinguishable through placement and artifact targets
without adding a compiler-side trust decision.

## Repository-only compiler corpus

[`../fixtures/native-compiler-corpus`](../fixtures/native-compiler-corpus) retains focused
TypeScript and TSX semantic stress cases alongside representative framework applications. The
release check sends those sources directly through `exactc`; there is no executable
JavaScript expression engine or alternate semantic backend. Its tracked wall-time guard normalizes
the baseline for both the discovered source count and the available native worker count, so CI and
local runs remain comparable without oversubscribing smaller machines.

The small public `@exactjs/module-rewrite` package owns module-reference rewriting still needed by
React compatibility tooling. It is a bounded source-text utility, not an eXact compiler.

## Change verification

Compiler and bundler-assembly changes trigger a dedicated acceptance workflow. It builds and runs:

- Sudoku for native client state and interaction;
- the client-only docs application for compiled components, routing, and code blocks; and
- Shipping Calculator for generated client/server continuations and `__exact` endpoint traffic.

The native package matrix separately builds, installs, and executes each supported platform
package. Publish checks inspect the compiler dependency graph and tarball so retired compiler
packages cannot re-enter generated applications unnoticed.

## Guarded DOM updates

Every region binder is finalized against the complete component dependency and dirty-mask contract.
An early state-only region must still subscribe to props when a later enclosing region reads them;
early regions also use the wide binder when later operations exceed two mask words.
Component update programs visit enclosing regions before their descendants. JSX regions are
registered after their children are lowered, so generated updates traverse those target identities
in reverse registration order. DOM subscriptions for these programs run in the structural phase,
before ordinary leaf bindings. Removing a region also clears its entry from any active update
snapshot, so a later operation in that update cannot read a value whose guard has become false.
Discriminators that read nested object or array properties retain tracked subscriptions: changing
`incident.comments` must update an empty-list branch even when the incident object itself is retained.
This preserves ordinary guarded property access when an optional selected resource disappears.
The regression fixture exercises removal and restoration through forwarded props and local state.
This corrects update ownership without changing emitted helper signatures or the ABI epoch.

### Component view helper inputs

A returned view can call a JSX helper with scalar arguments or live objects. Direct prop and state
reads used as arguments are snapshots, so the compiler gives that call a focused reactive range.
When an argument changes, the range reevaluates the helper and patches its retained render program;
the component instance, local state, and compatible DOM nodes remain owned by the same instance.
Passing a live props or state object instead lets the helper's field readers subscribe directly.
Unrelated state does not invalidate the helper. Both client and paired hydration projections use
this range contract; neither relies on component-wide render invalidation for helper snapshots.
This uses existing child-range and program-patching helpers without changing the component ABI.

### Type checking and source diagnostics

The checking projection preserves contextual callback types in ordinary JSX helpers and
materialized attribute readers, explicit annotations on derived values, and authored union or optional-value narrowing across generated
read closures. A proof comes from the source checker: an unguarded optional read or invalid union
member remains an error. Narrowing assertions never replace a `delete` operand, including
parenthesized property targets; the normal optional-property restriction still applies. Awaited expressions inside object or array assignments settle before the
compiler enters a synchronous task mutation, retaining cancellation checks before publication.
Keyed helper lists keep the same keyed identity contract in the executable targets.

Semantic diagnostics from generated code use the emitter's source map and normalization mapping
to report authored filenames and spans. Failures in unmapped generated code retain their generated
filename for investigation; imported-file diagnostics retain their own source location.

### Project file selection

`exactc --check --project tsconfig.json` selects roots using TypeScript's `files`, `include`,
`exclude`, and `extends` rules. `exactc --check` uses `tsconfig.json` in the current directory.
Included files are checked even when no application entry imports them, including test fixtures.
Imported dependencies still participate in TypeScript resolution; `exclude` is not an import firewall.
This checks one project, not a recursive solution build of project references.

Explicit inputs, such as `exactc --check --project tsconfig.json scripts`, override root selection
while retaining the project's compiler options. Directory inputs include supported source modules
outside the configuration's include list. Invalid configuration and checking errors exit nonzero.

Native extension analysis receives the authored source tree and authored coordinates. Compiler
normalization of destructured props, component returns, and setup computations happens in the
compilation path, so extension-produced edits remain applicable to the source submitted by the host.
