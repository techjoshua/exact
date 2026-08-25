# @exactjs/react-compat-build

Command-line and Node build tools for eXact React compatibility.

## Commands

- `exact-reactc` compiles source using the selected React 18 or React 19 compatibility target. An
  omitted eXact `--target` emits a client artifact; use `--target server` for server output or
  `--artifacts` for paired publication output.
- `exact-react-compat validate <adapter-root>` validates adapter metadata and public exports.
- `exact-react-compat report <build-root>` prints the effective adapter registry.

## Node ESM

```sh
node --import @exactjs/react-compat/register app.js
```

Use precompiled output for production CommonJS entry points, which do not reliably pass through
Node's ESM loader hook.

See [React compatibility](../../docs/react-compatibility.md).
