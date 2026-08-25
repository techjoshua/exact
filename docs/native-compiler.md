# Native compiler

`@exactjs/compiler` is the JavaScript process host and public API for the native `exactc` compiler. Parsing,
checking, eXact analysis, placement, policy enforcement, artifact partitioning, lowering,
generated-code validation, and printing execute in one persistent TypeScript-Go process.
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
Native protocol 1.34 and generated component-contract version 2 carry the normalized recursive
partition plan, including ordinary enhancement-component owners, structural templates,
crossing-edge data slots, source evidence, and partition-derived range contracts. It also retains
`setupExecution` on authored state assignments across source normalization, distinguishing
one-time initialization from deferred reactive calculation. Analysis responses remap those
assignment spans to the original source before returning them to the language service. Paired
component and intrinsic bindings are preserved as authored `valueBindings` edges with their parent
state path, endpoint props, callback value type, placement, artifact targets, and intrinsic adapter
identity; generated helper names never replace that source-facing description.
See [Compiler-aware language tools](language-tools.md).

## Application and compiler TypeScript versions

New applications use TypeScript 7 for editor support and `tsc` type-checking. The compiler owns
its pinned TypeScript-Go version independently of the application’s `typescript` dependency.
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

## Public integration

When emitted code reaches an optional enhancement, file and project compilation prepend its
artifact-local registration and materialize a provider facade under the output's
`.exact/enhancements` directory. Emitted modules import that ordinary ESM file, never an `exact:`
scheme, so unbundled Node SSR needs no custom loader. Provider resolution happens during
compilation, not per request; absence selects the shared pass-through, while malformed installed
exports fail when the generated module is linked.

For client artifacts, each provider facade also imports the DOM enhancement integration. The
integration registers a versioned realm capability synchronously, so bundlers place it with the
static, lazy, or microfrontend module that selected the provider rather than forcing it into every
application entry. Server facades continue to select the SSR catalog facade and do not import DOM
code. Build adapters must preserve the client facade's registration side effect.

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
equivalent resolved facades one content-derived module identity. Components that select the same
provider therefore share one browser module without weakening package-scoped authorization.

`exactc --check .` is the no-emit application type-check path. It analyzes and lowers each
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

Process startup is provisional until the worker starts and the native protocol/version handshake
completes. Any startup, timeout, or negotiation failure closes the worker and its child process
before the error escapes. Native JSX lowering receives one immutable analysis plan, prepares its
derived binding indexes once, and retains a single source traversal; lowering stages should extend
that plan instead of restoring a broad positional-argument boundary or adding extra tree walks.

Generated operation identifiers, ephemeral module analysis, helper imports, and lowered source
are compiler-session details. Applications should depend on authored TypeScript behavior and
documented executable runtime contracts rather than generated representation.

### Portable build analysis

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
