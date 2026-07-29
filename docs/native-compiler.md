# Native compiler

`@exactjs/compiler` is a JavaScript host for the native `exactc-native` compiler. Parsing,
checking, eXact analysis, placement, policy enforcement, artifact partitioning, lowering,
generated-code validation, and printing execute in one persistent TypeScript-Go process.

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
target artifacts, manifests, source maps, or inspection catalogs. Source
entities, typed reasons, rich diagnostics, and refactor plans are in-memory
projections of the same native component and placement analysis used by builds.
Native protocol 1.25 retains `setupExecution` on authored state assignments
across source normalization, distinguishing one-time initialization from
deferred reactive calculation. Analysis responses remap those assignment spans
to the original source before returning them to the language service.
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

Set `EXACT_NATIVE_COMPILER` only when a hermetic build or compiler-development workflow must
provide an explicit executable.

## Public integration

Applications normally compile through `@exactjs/vite-plugin`, `@exactjs/webpack-plugin`, or
`@exactjs/bun-plugin`. The `exactc` CLI supports precompiled pipelines. Direct tooling can use
`createCompilerSession`, `transformSource`, `analyzeSource`, and the artifact-planning APIs from
`@exactjs/compiler`.

A compiler session owns one persistent native process. Bundler integrations retain the session
for their lifecycle, invalidate its project state after file changes, report project-wide native
diagnostics, and dispose it when the build closes.

Generated operation identifiers, compiler manifests, helper imports, and lowered source are
coordination details. Applications should depend on authored TypeScript behavior and documented
runtime contracts rather than generated representation.

## Repository-only migration code

`@exactjs/expressions` is a private workspace retained for compiler experiments and corpus
measurements. It is not publishable and no public framework package depends on it.

The small public `@exactjs/module-rewrite` package owns module-reference rewriting still needed by
React compatibility tooling. It does not contain the retired eXact compiler.

## Change verification

Compiler and bundler-assembly changes trigger a dedicated acceptance workflow. It builds and runs:

- Sudoku for native client state and interaction;
- the docs application for compiled components, routing, code blocks, SSR, and hydration; and
- Shipping Calculator for generated client/server continuations and `__exact` endpoint traffic.

The native package matrix separately builds, installs, and executes each supported platform
package. Publish checks inspect the compiler dependency graph and tarball so the retired compiler
cannot re-enter generated applications unnoticed.
