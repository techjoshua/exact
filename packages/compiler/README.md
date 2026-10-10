# @exactjs/compiler

The native TypeScript and TSX compiler for eXact applications.

It analyzes components, reactive expressions, tasks, bindings, and client/server placement,
then emits the client, server, hydration, and optional inspection artifacts used by the runtime.
Most applications use `@exactjs/vite-plugin`, `@exactjs/webpack-plugin`, or `@exactjs/bun-plugin`.
Direct use serves build-tool authors, language tools, and custom artifact pipelines.
The package selects your platform's native binary, so application developers do not need Go.
It builds on Microsoft's Go compiler in `microsoft/TypeScript` and includes upstream notices.

## Check an application

```sh
npx exactc --check --project tsconfig.json
```

Check mode validates eXact semantics, lowers compiler-owned TSX, and checks the resulting
TypeScript without emitting files. It defaults to `tsconfig.json` in the current directory.
Project file selection includes unreferenced fixtures. Explicit paths override that selection
while retaining compiler options. See [project file selection](https://github.com/techjoshua/exact/blob/main/docs/native-compiler.md#project-file-selection).
Component props retain required/excess prop checks, spreads, generic inference, callback types,
and children. Form bindings are checked after normalization. Syntax-only compilation omits
semantic checks. Use check mode or semantic validation to reject type errors.

## Build a library

```sh
npx exactc build-library
npx exactc build-library --watch
```

The builder emits declarations, paired unbundled ESM modules, and static package metadata.
It validates compiled exports, proven component placement, and all required runtime dependencies
before replacing `dist/`. Failed builds retain the previous output. Staging and locks use `.exact/`.
Calls from Bun scripts require Node on `PATH` for export checks.
Watch mode rebuilds on source/configuration changes and closes on Ctrl+C. The consumer's dev
server must observe the published files. Wait for the first successful library build before
starting consumer SSR. A consumer that imports separately generated artifacts regenerates them
after publication, before reloading its SSR graph. Linked source reads its own package-scoped enhancements
statically from its package configuration.

The selected tsconfig controls source roots. Imported production sources belong to the build even
when excluded as roots. Test, spec, Jest, and test-support modules remain unpublished, and importing
them from production fails before replacement. Keep shared production helpers in published source.
`.mts` and `.mjs` retain `.mjs` output extensions. CommonJS compilation is unsupported.
A shared declaration tree such as `dist/types` is copied once. Declaration output must avoid paired
target directories, which `exactTargetDirectories` can rename.
Use `--project tsconfig.types.json` for a separate declaration configuration or `--skip-declarations`
when another pipeline owns TypeScript output. Custom tooling can call `buildLibrary()` from
`@exactjs/compiler/library-build`. See [library setup and configuration](https://github.com/techjoshua/exact/blob/main/docs/component-library-trust.md#build-a-component-or-enhancement-library).

Rebuild libraries with compiler 0.7.1 to publish registration products for automatic discovery of
library islands and continuation plans, then regenerate consumer artifacts. Older protocol-1
metadata remains accepted. Publish both targets and metadata from one build together.
Generated identities and enhancement facades depend on physical source location. Different
checkout paths are not guaranteed to produce identical bytes. Retain the actual release tarball.
Publish CSS through an ordinary package subpath marked as a side effect. The application adapter
bundles browser stylesheet imports alongside JSX helpers. Server artifacts omit client stylesheet
execution. The library builder does not bundle CSS.

## Programmatic integration

The package exposes source transforms, compiler sessions, diagnostics, artifact planning,
client-isolation checks, and `createExactLanguageService()` for editors. Dispose owned sessions
when the host closes. Compilation returns emitted paths and build facts. Semantic analysis and
generated component, operation, continuation, and registry identities remain compiler-owned.
When `rootDir` and `outDir` are supplied, outside inputs fail before output paths are derived.
Artifact projects stage the complete output set and restore previous files on publication failure.

For concrete runtime bundles, `componentContractProjection: 'hydrate'` retains resumptions and
`'client'` omits them. Leaving it unset preserves a rendering-mode-neutral contract. Both omit
analysis inventories already present in `componentBuild`.
Enhanced paired artifacts are bundler input. Unbundled execution uses single-target `compileProject`
output and physical facades. With `sourceMap` enabled, `moduleTransform` must return a version 3
map. See [native compiler integration](https://github.com/techjoshua/exact/blob/main/docs/native-compiler.md#public-integration).
Custom library pipelines can write validated static facts through
`@exactjs/compiler/component-library-build`. The writer does not implement consumer trust policy.

See the [component language](https://github.com/techjoshua/exact/blob/main/docs/component-language.md).
[Documentation](https://techjoshua.github.io/exact/#/learn/compiler-tour) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/compiler)
