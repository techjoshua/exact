# @exactjs/compiler

The native TypeScript and TSX compiler for eXact applications.

## Overview

The compiler analyzes components, reactive expressions, tasks, bindings, and client/server
placement. It emits the client, server, hydration, and optional inspection artifacts consumed by
the eXact runtime.

Most applications should use the compiler through `@exactjs/vite-plugin`,
`@exactjs/webpack-plugin`, or `@exactjs/bun-plugin`. Direct use is intended for build-tool authors,
language tools, and custom artifact pipelines.

## Command line

```sh
npx exactc --help
```

The npm package selects the native compiler binary for the current operating system and
architecture. Application developers do not need Go installed.

## Programmatic use

The package exposes source transforms, long-lived compiler sessions, diagnostics, artifact
planning, client-isolation checks, and `createExactLanguageService()` for no-emit editor analysis.
Artifact compilation returns emitted paths and narrow build products for package exports,
registrations, exposure selection, executable contracts, inspection, and diagnostics. An artifact
graph consolidates distributed task operations and boundaries once while retaining only
module-local dependencies and component identity on each artifact entry. Ephemeral semantic
analysis is compiler-owned and is not part of compilation results or artifact graphs.
Generated component, operation, continuation, and registry identities are opaque build output.

Build and test adapters can call `inspectExactComponentBuildFacts()` for the same protocol-1
descriptive component/import projection without emitting JavaScript. The result contains no marker
interpretation, package trust, or authorization decision; adapters must join its authored edges to
their own resolver provenance.

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

See the [component language](../../docs/component-language.md),
[tasks](../../docs/tasks.md), [component registries](../../docs/component-registries.md), and
[language tools](../../docs/language-tools.md) references.
