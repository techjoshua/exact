# TypeScript 7 native checker proof of concept

Status: historical proof of concept. The production native backend now lives in
`packages/expressions/src/project/native-project.ts`.

This experiment tests whether `@exactjs/expressions` can obtain its semantic
inputs from TypeScript 7's native checker without waiting for a stable public
TypeScript API or embedding a fork of `typescript-go`.

It uses the unstable synchronous API included in TypeScript 7.0.2. The
JavaScript client starts the bundled Go compiler in `--api` mode and communicates
through TypeScript's synchronous MessagePack transport. Source and configuration
files remain in memory through the API's filesystem callbacks.

Run it with:

```sh
npm run poc:native-checker
```

The probe:

1. creates equivalent legacy and native projects from one in-memory TSX module;
2. compares primitive type facts for selected identifiers by source span;
3. changes the component state types and expressions in memory;
4. advances both projects incrementally and compares the new facts; and
5. reports native request, transfer, materialization, and timing totals.

The comparison intentionally stops at a narrow semantic slice. A complete
backend must project scopes, symbol identity, complete types and signatures,
directives, control flow, module relationships, diagnostics, and emission facts
into the existing expression model.
