# @exactjs/react-dom-compat

Compatibility implementations of `react-dom`, `react-dom/client`, `react-dom/server`, and
related entry points on eXact runtimes.

## Usage

Applications normally receive this package through automatic substitution when React compatibility
is enabled in an eXact build integration. Import it directly only when intentionally targeting the
ReactDOM-compatible API.

## Supported surface

The package provides roots, hydration, portals, server rendering and streaming, resource hints,
error callbacks, batching, Suspense behavior, and Activity retention. React components remain
React-owned; the compatibility runtime hosts them through fixed precompiled client and server root
artifacts. Native-only bundles do not import these roots or the optional native-contribution
integration.

See [React compatibility](https://github.com/techjoshua/exact/blob/main/docs/react-compatibility.md).

[Documentation](https://techjoshua.github.io/exact/#/guides/react-compatibility) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/react-dom-compat)
