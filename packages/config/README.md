# @exactjs/config

Typed project configuration for eXact applications and framework plugins.

## Usage

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	componentLibraries: {
		mode: 'trusted',
		trustedScopes: ['@acme/']
	}
});
```

`defineConfig()` validates the shared schema while preserving plugin-specific types added through
TypeScript declaration merging. It rejects unknown or invalid built-in options and freezes the
validated graph so consumers cannot observe different policy through later mutation. The Node
loader applies the same normalization to plain JavaScript and TypeScript configs, including configs
that do not call `defineConfig()`. One configuration can supply compiler, server, renderer, client,
testing, and plugin settings.

`componentLibraries` is the one shared policy used by server bundlers and test adapters. Its
`trusted` default admits direct application dependencies, explicitly configured packages/scopes,
delegated production dependencies, and compatible `@exactjs/` libraries unless denied. This is
authorization for in-process server code, not a sandbox.

Set `includeDefaultTrustedScopes: false` to remove the built-in `@exactjs/` scope. Direct
production dependencies and explicit allow rules still apply. A library's production dependencies
can receive delegated trust, while its peer dependencies require the consumer's own authorization.
An explicit deny takes precedence. Use `allow`, `deny`, and `trustedScopes` to name those decisions.
`unauthorizedOptionalEnhancements` controls whether an unauthorized optional enhancement is an
error or is omitted. See the [policy reference](https://techjoshua.github.io/exact/#/components/trust)
for the available modes and optional-enhancement behavior.

Build-tool integrations can load the same discovered configuration through `@exactjs/config/node`;
application code should continue to use the browser-safe main entry.

An enhancement can be made available to every compiled component in the package by declaring its
namespace directly in `exact.config.*`:

```ts
export * as intl from '@exactjs/intl/enhancements' with { type: 'exact-enhancement', scope: 'package' };
```

The namespace export makes package ownership explicit and avoids an unused file-local binding. The
Node loader records it statically without executing the enhancement module. The
compiler and language tools treat the binding as a virtual per-component import and emit runtime
catalog imports only where its namespace is used.

Build-tool integrations can use `exactConfigSearchPaths` from `@exactjs/config/node` to watch
configuration candidates before they exist. `findExactConfig` selects the nearest existing file.

## Debug configuration

Build-time inspection catalogs and browser runtime instrumentation are separate controls. Enable
only what the target environment needs, configure server authorization independently, and disable
both for hardened output.

See [eXact DevTools](https://github.com/techjoshua/exact/blob/main/docs/devtools.md) for the complete deployment model.

[Documentation](https://techjoshua.github.io/exact/#/plugins) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/config)
