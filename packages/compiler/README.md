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

Use `npx exactc --check --project tsconfig.json` for no-emit application checking. It validates eXact source semantics,
lowers compiler-owned TSX such as component value/callback bindings, and runs TypeScript semantic
checking on the resulting representation. This preserves ordinary TypeScript errors without
requiring raw `tsc` to understand eXact syntax. Check mode uses `tsconfig.json` in the current
directory when present; pass `--project path/to/tsconfig.json` to select another configuration.

Check mode without explicit paths honors the project's TypeScript file selection, including
unreferenced fixtures. Explicit paths override that selection while retaining compiler options.
See [project file selection](https://github.com/techjoshua/exact/blob/main/docs/native-compiler.md#project-file-selection).

The npm package selects the native compiler binary for the current operating system and
architecture. Application developers do not need Go installed.
The native executable builds on Microsoft's Go compiler in `microsoft/TypeScript`.
Platform packages include its Apache-2.0 license and upstream third-party notices.

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

The package exposes source transforms, long-lived compiler sessions, diagnostics, artifact
planning, client-isolation checks, and `createExactLanguageService()` for no-emit editor analysis.
Artifact compilation returns emitted paths and narrow build products for package exports,
registrations, exposure selection, executable contracts, inspection, and diagnostics. An artifact
graph consolidates distributed task operations and boundaries once while retaining only
module-local dependencies and component identity on each artifact entry. Ephemeral semantic
analysis is compiler-owned and is not part of compilation results or artifact graphs.
Generated component, operation, continuation, and registry identities are opaque build output.

When direct compilation supplies both `rootDir` and `outDir`, every input must be contained by the
source root. The compiler rejects an outside input before deriving or writing an output path.
Artifact projects stage their complete client, server, shared, map, and inspection output set. A
publication failure restores the previous files rather than leaving a partially updated build.

Build-tool authors may set `componentContractProjection` only when producing a concrete runtime
bundle. `hydrate` retains resumption metadata, `client` omits it, and both omit analysis-only
component inventories already present in `componentBuild`. Leaving the option unset preserves the
complete rendering-mode-neutral compiler contract.

Paired artifacts retain portable optional-enhancement requests for the consuming eXact Vite
adapter. Enhanced paired output is bundler input, not directly executable Node ESM. Use
single-target `compileProject` output and its physical facades for unbundled execution; see
[output modes](https://github.com/techjoshua/exact/blob/main/docs/native-compiler.md#public-integration).

Source maps compose across native lowering and mapped host transforms. A `moduleTransform` must
return a valid version 3 map when `sourceMap` is enabled. See
[native compiler integration](https://github.com/techjoshua/exact/blob/main/docs/native-compiler.md) for mapping and build-fact inspection.

Published libraries can use `@exactjs/compiler/component-library-build` to normalize and write the
static protocol-1 package facts referenced by `exactComponentLibrary.build`. This writer validates
component/export correspondence but deliberately contains no trust policy.

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
