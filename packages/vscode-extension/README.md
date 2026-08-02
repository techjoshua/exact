# eXact Language Tools for VS Code

Compiler-backed editing support for eXact components and TypeScript.

## Features

The extension adds eXact diagnostics, component and task hovers, navigation, semantic tokens,
inlay hints, CodeLens, refactors, region markers, a component semantics tree, and a read-only
client/server separation view. A bundled TypeScript plugin supplies component-owned `this.` and
namespaced enhancement-prop completions, and removes only the corresponding false-positive
TypeScript diagnostics. Other TypeScript diagnostics and syntax presentation remain intact.

Compiler analysis starts only for trusted workspaces. Source and inspection data remain local.

## Run from this repository

```sh
npm run dev:vscode-extension
```

The command builds the language server and extension, then opens an Extension Development Host.
Use `--code code-insiders`, `--workspace <path>`, `--skip-build`, or `--dry-run` when needed.

See [compiler-aware language tools](../../docs/language-tools.md) for the semantic model.
