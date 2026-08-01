# @exactjs/deno-adapter

Deno runtime adapter for eXact server endpoints.

## Usage

```ts
import { createExactDenoHandler } from '@exactjs/deno-adapter';

const exact = createExactDenoHandler(exactRuntime);
Deno.serve(exact);
```

Deno's server API is Fetch-compatible, so the adapter returns a standard `Response` and delegates
protocol validation and dispatch to `@exactjs/server`.
