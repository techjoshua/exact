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
TypeScript declaration merging. One configuration can supply compiler, server, renderer, client,
testing, and plugin settings.

`componentLibraries` is the one shared policy used by server bundlers and test adapters. Its
`trusted` default admits direct application dependencies, explicitly configured packages/scopes,
delegated production dependencies, and compatible `@exactjs/` libraries unless denied. This is
authorization for in-process server code, not a sandbox.

Build-tool integrations can load the same discovered configuration through `@exactjs/config/node`;
application code should continue to use the browser-safe main entry.

## Debug configuration

Build-time inspection catalogs and browser runtime instrumentation are separate controls. Enable
only what the target environment needs, configure server authorization independently, and disable
both for hardened output.

See [eXact DevTools](../../docs/devtools.md) for the complete deployment model.
