# @exactjs/language-server

Language Server Protocol support backed by the native eXact compiler.

## Start the server

```sh
exact-language-server --stdio
```

The server runs beside the editor's normal TypeScript support. It provides eXact diagnostics,
component and task semantics, hovers, navigation, semantic tokens, inlay hints, document symbols,
refactor previews, and a read-only client/server separation view.

## Integration model

Compiler results are tied to the current document lifetime and version. Stale asynchronous results
are discarded. Ordinary TypeScript diagnostics remain owned by the editor's TypeScript service.

Trusted clients should send `initializationOptions.workspaceTrusted: true`. Untrusted workspaces
do not launch workspace compiler binaries or plugins.

Embedding hosts that change workspace folders should supply all current open inputs to
`manager.reconcileWorkspaceFolders({ added, removed }, inputs)`. It returns affected input references
synchronously and a `completion` promise resolving to `{ results, errors }` after reseeding and cleanup.
Handle both fields. Successful current results remain available when another project reports a
setup, analysis or cleanup failure. Error values are preserved, including `undefined`. Low-level `addRoot` and `removeRoot` do not transfer unsaved text. Failed preparation
keeps the affected project unavailable until explicit input or reconciliation supplies current source.

The VS Code client is provided by `@exactjs/vscode`. See
[compiler-aware language tools](https://github.com/techjoshua/exact/blob/main/docs/language-tools.md) for protocol details.

[Documentation](https://techjoshua.github.io/exact/#/learn/language-tools) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/language-server)
