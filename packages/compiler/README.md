# @exactjs/compiler

The native TypeScript and TSX compiler for eXact applications.

The compiler analyzes components, reactive expressions, tasks, bindings, and client/server placement. It emits the client, server, hydration, and optional inspection artifacts consumed by the eXact runtime.

Most applications should use the compiler through `@exactjs/vite-plugin`,
`@exactjs/webpack-plugin`, or `@exactjs/bun-plugin`. Direct use is intended for build-tool authors,
language tools, and custom artifact pipelines.

## Command line

```sh
npx exactc --help
```

Use `npx exactc --check --project tsconfig.json` for no-emit application checking. It validates eXact
semantics, lowers compiler-owned TSX, and checks the resulting TypeScript. Check mode defaults to
`tsconfig.json` in the current directory; `--project` selects another configuration.

Check mode without explicit paths honors the project's TypeScript file selection, including
unreferenced fixtures. Explicit paths override that selection while retaining compiler options.
See [project file selection](https://github.com/techjoshua/exact/blob/main/docs/native-compiler.md#project-file-selection).

The package selects the native binary for your platform; application developers do not need Go.
It builds on Microsoft's Go compiler in `microsoft/TypeScript` and includes upstream license notices.

## Build a library

Component libraries and enhancement providers can use `exactc build-library` as their build
script. It emits declarations and paired unbundled modules, validates compiled exports and
runtime dependencies, and generates static package metadata. The command owns `dist/` and
restores the previous output if the build fails. Sources must be ESM; `.mts` and `.mjs` retain
`.mjs` outputs, while CommonJS compilation is unsupported. Declaration output must avoid the
paired target directories, which can be renamed with `exactTargetDirectories`.

Use `--project tsconfig.types.json` for a separate declaration configuration or
`--skip-declarations` when another pipeline has already emitted TypeScript output. Custom tooling
can call `buildLibrary()` from `@exactjs/compiler/library-build` with the same behavior.
See [library setup and supported configuration](https://github.com/techjoshua/exact/blob/main/docs/component-library-trust.md#build-a-component-or-enhancement-library).

## Programmatic use

The package exposes source transforms, compiler sessions, diagnostics, artifact planning,
client-isolation checks, and `createExactLanguageService()` for editor analysis. Compilation returns
emitted paths and build facts; semantic analysis remains compiler-owned. Generated component,
operation, continuation, and registry identities are opaque.

When direct compilation supplies both `rootDir` and `outDir`, every input must be contained by the
source root. The compiler rejects an outside input before deriving or writing an output path.
Artifact projects stage their complete client, server, shared, map, and inspection output set. A
publication failure restores the previous files rather than leaving a partially updated build.

Build-tool authors can use `componentContractProjection` for concrete runtime bundles: `hydrate`
retains resumptions, `client` omits them, and leaving it unset preserves the rendering-mode-neutral
contract. Both projections omit analysis-only inventories already present in `componentBuild`.

Enhanced paired artifacts are bundler input. For unbundled execution, use single-target
`compileProject` output and its physical facades. Source maps compose across native lowering and
host transforms; `moduleTransform` must return a version 3 map when `sourceMap` is enabled.
See [native compiler integration](https://github.com/techjoshua/exact/blob/main/docs/native-compiler.md#public-integration) for output modes and inspection.

Custom library pipelines can write validated static package facts through
`@exactjs/compiler/component-library-build`; this writer does not implement consumer trust policy.

```ts
const language = createExactLanguageService({ root, noEmit: true });
await language.synchronize([{ kind: 'upsert', filename, version, source }]);
const inspection = await language.inspect(filename);
await language.dispose();
```

## Learn more

See the [component language](https://github.com/techjoshua/exact/blob/main/docs/component-language.md),
[tasks](https://github.com/techjoshua/exact/blob/main/docs/tasks.md), [component registries](https://github.com/techjoshua/exact/blob/main/docs/component-registries.md), and
[language tools](https://github.com/techjoshua/exact/blob/main/docs/language-tools.md) references.

[Documentation](https://techjoshua.github.io/exact/#/learn/compiler-tour) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/compiler)
