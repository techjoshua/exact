# eXact React compatibility build tools

- `exact-reactc` compiles eXact source and applies the same compatibility
  registry used by Vite and Node. Use `--reactTarget auto|18|19` and
  `--compatibilityRoot <app>` when the command is launched outside the app.
- `exact-react-compat validate <adapter-root>` validates adapter metadata,
  marker ownership, source ranges, conflicts, and public target subpaths.
- `exact-react-compat report <build-root>` prints active/ignored adapters,
  substitutions, source and adapter versions, watched metadata, and registry
  hash.

For Node ESM, preload the shared loader with
`node --import @exactjs/react-compat/register app.js`. CommonJS entry modules do
not pass through Node's ESM load hook reliably; precompile them with
`exact-reactc` for production. Static CommonJS encountered by a cooperating
host is supported by the shared transformer.
