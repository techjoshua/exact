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

## Debug configuration

Build-time inspection catalogs and browser runtime instrumentation are separate controls. Enable
only what the target environment needs, configure server authorization independently, and disable
both for hardened output.

See [eXact DevTools](../../docs/devtools.md) for the complete deployment model.
