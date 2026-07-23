# @exactjs/fetch-adapter

Fetch-compatible adapter for the eXact server runtime. Use this anywhere the platform receives a standard `Request` and returns a standard `Response`.

```ts
import { createExactFetchHandler } from '@exactjs/fetch-adapter';
import { createExactServerRuntime } from '@exactjs/ssr';

const exact = createExactFetchHandler(
	createExactServerRuntime({
		manifest,
		actions,
		boundaries
	})
);

export default {
	fetch(request: Request) {
		return exact(request);
	}
};
```

Configure the endpoint path in the eXact manifest/runtime. The core `@exactjs/server` handler still performs manifest allowlisting, payload validation, authorization, CSRF validation, and patch dispatch.
