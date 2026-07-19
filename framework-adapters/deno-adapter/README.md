# @exact/deno-adapter

Deno runtime adapter for eXact server endpoints.

```ts
import { createExactDenoHandler } from '@exact/deno-adapter';

const exact = createExactDenoHandler(exactRuntime);

Deno.serve((request) => exact(request));
```

Deno's server API is Fetch-compatible, so the adapter delegates to the centralized eXact server protocol and returns a standard `Response`.
