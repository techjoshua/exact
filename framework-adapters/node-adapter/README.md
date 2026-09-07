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
`writeNodeResponseBody(response, rendered, signal)`. It claims eXact's ordered chunks directly,
honors Node backpressure, and avoids constructing the response's lazy Web stream. Use
`cancelNodeResponseBody(rendered, reason)` for a `HEAD` response or an abandoned body. Each body is
single-consumer: write it, request its Web stream, or cancel it exactly once.

`createExactNodeHandler()` reports unexpected request, response-production, and cleanup failures
through the runtime's `logger`, or to the server console when no logger is supplied. A custom
`writeNodeResponse(response, result, signal, logger)` call can supply the same optional logger.
Error responses remain generic; original failures stay in server logs. A failing custom logger
falls back to the console without preventing response cleanup. Lower-level
`writeNodeResponseBody()` rejects on failure so its caller can report and terminate its own response.
