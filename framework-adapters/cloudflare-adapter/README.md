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

Set `compatibility_flags = ["enable_request_signal"]` in your Workers configuration to observe
client cancellation. Disconnect detection can wait for the next response write. Progress is
request-scoped and best effort; it is not durable background work. Native local workerd checks
cover streaming and cleanup, but your deployment's buffering and execution limits still apply.

Workers bind I/O resources, including native cancellation signals, to their creating request.
Keep fetches, streams, and other request-owned resources in request contexts. Application contexts
may cache reusable data, but must not share request-owned I/O across invocations.

[Documentation](https://techjoshua.github.io/exact/#/runtimes) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/framework-adapters/cloudflare-adapter)
