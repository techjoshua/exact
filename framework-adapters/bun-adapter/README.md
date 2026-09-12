# @exactjs/bun-adapter

Bun runtime adapter for eXact server endpoints and custom SSR page handlers.

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
Buffered SSR responses pass their complete text to Bun's native `Response`. Produced SSR bodies use
the streaming boundary.

## Automatic request scheduling

The handler automatically trials bounded request-start batches under sustained load and retains
them when native request drain and event-loop delay improve. Sparse requests start immediately.
Pass `{ adaptive: false }` as the second factory argument to disable scheduling, or set
`maxBatchSize` to change the default limit of 32 starts per callback.

For custom pages, wrap the complete Fetch dispatcher once:

```ts
import { createBunRequestHandler } from '@exactjs/bun-adapter';

Bun.serve({ fetch: createBunRequestHandler(renderPage) });
```

Forward both `(request, server)` when adding another callback around the handler. Scheduling uses
Bun's host-wide `pendingRequests` counter, so route all HTTP requests through this Fetch dispatcher
instead of combining it with Bun's native `routes` map. Calls without a server argument remain
immediate. The outer handler owns scheduling when it dispatches to another eXact handler.
Forward `request.signal` to SSR so rendering inherits the same adaptive policy at render entry
and after pending component data settles. Ready components continue synchronously. Responses
are neither shared nor wrapped for scheduling; streaming and cancellation remain native.
