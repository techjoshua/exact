# @exact/bun-adapter

Bun runtime adapter for eXact server endpoints.

```ts
import { createExactBunHandler } from '@exact/bun-adapter';

const exact = createExactBunHandler(exactRuntime);

Bun.serve({
	port: 3000,
	fetch(request) {
		return exact(request);
	}
});
```

Bun uses the Fetch API for server requests, so this adapter is intentionally thin while giving Bun users a clear package and documented entrypoint.
