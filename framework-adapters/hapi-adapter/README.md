# @exact/hapi-adapter

Hapi route handler for eXact server endpoints.

```ts
import { createExactHapiHandler } from '@exact/hapi-adapter';

server.route({
	method: 'POST',
	path: '/__exact',
	handler: createExactHapiHandler(exactRuntime)
});
```

The adapter reads `request.payload` and returns a normal Hapi response object. Keep the Hapi route path aligned with your eXact manifest endpoint.
