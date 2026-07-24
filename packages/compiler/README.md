# @exactjs/compiler

The eXact TypeScript and TSX compiler. It analyzes component setup, reactive reads and writes,
tasks, bindings, server/client placement, assets, and server-component boundaries, then emits
renderer-ready JavaScript and manifests.

Most applications should consume the compiler through `@exactjs/vite-plugin`,
`@exactjs/webpack-plugin`, or `@exactjs/bun-plugin`. Direct consumers can use `transformSource`,
compiler sessions, artifact planning, diagnostics, and the CLI.

```sh
npx exact-compile --help
```

Compiler diagnostics are part of the programming model: writable bindings, stable list identity,
task placement, and server/client boundaries are validated before runtime.

## TypeScript compatibility

The compiler imports the programmatic TypeScript API and therefore depends on
`typescript` aliased to Microsoft's `@typescript/typescript6` compatibility package. TypeScript
7.0 intentionally ships without a programmatic API, so it cannot replace that dependency.

Applications may still use TypeScript 7 for editor support and command-line type-checking. npm
keeps the application's TypeScript 7 executable alongside eXact's private TypeScript 6 API
dependency. This separation will remain until the new programmatic API planned for TypeScript 7.1
is available and eXact has adopted it.
