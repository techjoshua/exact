# @exactjs/config

Typed project configuration for eXact applications and framework plugins.

## Usage

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	plugins: []
});
```

`defineConfig()` validates the shared schema while preserving plugin-specific types added through
TypeScript declaration merging. One configuration can supply compiler, server, renderer, client,
testing, and plugin settings.

## Debug configuration

Build-time inspection catalogs and browser runtime instrumentation are separate controls. Enable
only what the target environment needs, configure server authorization independently, and disable
both for hardened output.

See [eXact DevTools](../../docs/devtools.md) for the complete deployment model.
