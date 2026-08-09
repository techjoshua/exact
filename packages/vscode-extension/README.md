# eXact Language Tools for VS Code

Compiler-backed editing support for eXact components and TypeScript.

## Features

The extension adds eXact diagnostics, component and task hovers, navigation, semantic tokens,
inlay hints, CodeLens, refactors, region markers, a component semantics tree, and a read-only
client/server separation view. A bundled TypeScript plugin supplies component-owned `this.` and
namespaced enhancement-prop completions, and removes only the corresponding false-positive
TypeScript diagnostics. Other TypeScript diagnostics and syntax presentation remain intact.
Trusted package providers can also underline source fragments that prove an inference. These
decorations retain normal syntax coloring and explain their provider-owned evidence on hover.

Compiler analysis starts only for trusted workspaces. Source and inspection data remain local.
In a monorepo, each document uses its nearest `exact.config.*` without escaping the containing VS
Code workspace folder. The status-bar tooltip shows the selected project root and every active
language provider's health; provider startup failures use a warning status instead of disappearing.

## Run from this repository

```sh
npm run dev:vscode-extension
```

The command builds the language server, bundles the extension client beneath its registered
extension path, and then opens an Extension Development Host. The bundle keeps VS Code's host API
external while containing the language client's runtime dependencies.
Use `--code code-insiders`, `--workspace <path>`, `--skip-build`, or `--dry-run` when needed.

See [compiler-aware language tools](../../docs/language-tools.md) for the semantic model.
