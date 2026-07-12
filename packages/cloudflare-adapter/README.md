# @exact/cloudflare-adapter

Cloudflare Workers adapter for eXact server endpoints.

```ts
import { createExactCloudflareHandler } from "@exact/cloudflare-adapter";

const exact = createExactCloudflareHandler(exactRuntime);

export default {
  fetch(request, env, ctx) {
    return exact(request, env, ctx);
  }
};
```

Workers use the Fetch API, but this adapter documents the Cloudflare handler signature and keeps eXact endpoint wiring explicit for edge deployments.
