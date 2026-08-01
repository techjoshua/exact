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

Compiler results are tied to the current document version; stale asynchronous results are
discarded. Ordinary TypeScript diagnostics remain owned by the editor's TypeScript service.

Trusted clients should send `initializationOptions.workspaceTrusted: true`. Untrusted workspaces
do not launch workspace compiler binaries or plugins.

The VS Code client is provided by `@exactjs/vscode`. See
[compiler-aware language tools](../../docs/language-tools.md) for protocol details.
