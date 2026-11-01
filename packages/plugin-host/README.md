# @exactjs/plugin-host

Discovery and lifecycle host for eXact framework plugins.

## Usage model

Use the browser-safe main entry point for shared contracts and
`@exactjs/plugin-host/node` for filesystem-backed discovery. A host loads application
configuration, discovers manifests, validates dependencies and capabilities, orders plugins, and
prepares the projection needed by a build adapter, server, renderer, client, or test runner. The
compiler does not consume this registry or execute plugin callbacks.

Prepare one registry per application root and dispose or invalidate it with the owning build or
runtime session. Preparation has no automatic deadline. Hosts can pass `signal` or an explicit
positive `timeoutMs` in milliseconds. Contexts, discovery records, and reports retain TypeScript
readonly views without runtime freezing. Configuration and server projections must not be copied
into browser output.

See [framework plugins](https://github.com/techjoshua/exact/blob/main/docs/framework-plugins.md).

[Documentation](https://techjoshua.github.io/exact/#/plugins) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/plugin-host)
