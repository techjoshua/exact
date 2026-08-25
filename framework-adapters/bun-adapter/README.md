# @exactjs/bun-adapter

Bun runtime adapter for eXact server endpoints.

## Usage

```ts
import { createExactBunHandler } from '@exactjs/bun-adapter';

const exact = createExactBunHandler(exactRuntime);

Bun.serve({
	port: 3000,
	fetch: exact
});
```

Bun uses the Fetch API, so the adapter returns a standard `Response` while
`@exactjs/server` remains responsible for protocol validation and dispatch.
Buffered SSR responses use Bun's native Blob body path, preserving compiler-produced chunks without
joining them or allocating a compatibility `ReadableStream`.
