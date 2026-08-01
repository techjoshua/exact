# @exactjs/cloudflare-adapter

Cloudflare Workers adapter for eXact server endpoints.

## Usage

```ts
import { createExactCloudflareHandler } from '@exactjs/cloudflare-adapter';

const exact = createExactCloudflareHandler(exactRuntime);

export default {
	fetch(request, env, context) {
		return exact(request, env, context);
	}
};
```

The adapter preserves the Worker handler signature and delegates protocol validation and dispatch
to `@exactjs/server`.
