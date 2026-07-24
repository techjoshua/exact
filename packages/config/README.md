# @exactjs/config

Typed configuration contracts for eXact applications and framework plugins.

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	plugins: []
});
```

`defineConfig` preserves the concrete configuration type while validating the shared schema.
Framework plugins augment the registry through TypeScript declaration merging, allowing one
configuration file to project compiler, server, render, client, and testing behavior.
