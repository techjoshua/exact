# @exactjs/fetch-adapter

Fetch-compatible adapter for the eXact server runtime.

## Usage

```ts
import { createExactFetchHandler } from '@exactjs/fetch-adapter';

const exact = createExactFetchHandler(exactRuntime);

export default {
	fetch(request: Request) {
		return exact(request);
	}
};
```

Use this adapter on any host that receives a standard `Request` and returns a standard
`Response`. Endpoint matching, validation, authorization, and dispatch remain in
`@exactjs/server`. Request bodies remain streaming until the server runtime has enforced its
configured `maxRequestBytes` limit.
