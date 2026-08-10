# @exactjs/node-adapter

Low-level Node `http` adapter for eXact server endpoints.

## Usage

```ts
import { createServer } from 'node:http';
import { createExactNodeHandler } from '@exactjs/node-adapter';

const exact = createExactNodeHandler(exactRuntime);
createServer(exact).listen(3000);
```

Use this package with `http.createServer()` or beneath a custom Node server. It normalizes Node
request and response objects; protocol validation and dispatch remain in `@exactjs/server`.

Custom Node page handlers that surround SSR output with an HTML template should use
`writeNodeResponseBody(response, rendered, signal)`. It claims eXact's buffered body directly,
honors Node backpressure, and avoids constructing the response's lazy Web stream. Use
`cancelNodeResponseBody(rendered, reason)` for a `HEAD` response or an abandoned body. Each body is
single-consumer: write it, request its Web stream, or cancel it exactly once.
