# @exactjs/node-adapter

Node HTTP hosting for eXact endpoints and rendered application pages.

## Usage

```ts
import { createServer } from 'node:http';
import { createExactNodeHandler } from '@exactjs/node-adapter';

const exact = createExactNodeHandler(exactRuntime);
createServer(exact).listen(3000);
```

Use this package with `http.createServer()` or beneath a custom Node server. It normalizes Node
request and response objects; protocol validation and dispatch remain in `@exactjs/server`.
The adapter exposes the incoming Node request as `platformRequest`. Supply caller services through
the top-level `requestContexts` option when creating the server runtime, as shown in the
[request-context recipe](https://github.com/techjoshua/exact/blob/main/docs/server-context-and-data-policy.md#supplying-caller-information-to-continuations).

For complete SSR documents, await `renderExactRequestToHtmlResponse()` from `@exactjs/ssr`
and pass the result to `writeNodeResponse(response, rendered, signal)`. Buffered output is
committed with one terminal Node write. Pass progressive responses to the same adapter when
shell publication before hydration is required.

`createExactNodeHandler()` enables adaptive scheduling automatically on Node. For custom page
handlers, wrap the complete handler with `createNodeHandler(handler)` so admission occurs before
string or streaming rendering begins. Its callback receives `(request, response, signal)`; forward
that signal to rendering and response writing. SSR inherits the same adaptive policy at render
entry and after pending component data settles. Ready components continue synchronously.
Create the wrapper once per host.

Quiet requests start immediately. Under sustained event-loop delay, the adapter briefly trials
batched starts and compares completed-response capacity and lag with immediate controls before
and after the trial. Demand-limited trials can instead demonstrate low delay, spare event-loop
capacity, and completion of virtually all admitted work. It backs off unsuccessful trials.
A successful policy stays active while
event-loop delay is low and the loop has spare capacity; lower offered demand alone does not
disable useful scheduling. Sustained busy or lagging traffic resumes reassessment; isolated
busy samples do not interrupt a healthy policy.
Monitoring stops when idle. The Node HTTP compatibility adapter keeps immediate starts when running on Bun. Native Bun Fetch
hosting uses the separate Bun adapter and its automatic admission policy.

Both factories accept `{ adaptive: false }` to disable automatic scheduling and `maxBatchSize`
(default 32) to bound starts per callback. This is not a bound on total rendering time in a turn.
`createNodeRenderScheduler()` remains a low-level, always-yielding gate for an explicit SSR
`scheduleRender` hook. The default renderer already inherits the adaptive policy through the
request signal. An explicit hook replaces that render policy; disable adapter admission with
`{ adaptive: false }` when supplying a complete custom scheduling policy. The Node gate prefers `scheduler.yield()` and falls back to
`setImmediate()`; pending disconnects leave the queue promptly.

Use `writeNodeResponseBody(response, rendered, signal)` when a custom handler owns the remainder
of the response. It consumes ordered chunks with Node backpressure and leaves the response open.
Use `cancelNodeResponseBody(rendered, reason)` for a `HEAD` response or an abandoned body. Each
body is single-consumer: write it, request its Web stream, or cancel it exactly once.

`createExactNodeHandler()` reports unexpected request, response-production, and cleanup failures
through the runtime's `logger`, or to the server console when no logger is supplied. A custom
`writeNodeResponse(response, result, signal, logger)` call can supply the same optional logger.
Error responses remain generic; original failures stay in server logs. A failing custom logger
falls back to the console without preventing response cleanup. Lower-level
`writeNodeResponseBody()` rejects on failure so its caller can report and terminate its own response.

[Documentation](https://techjoshua.github.io/exact/#/runtimes) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/framework-adapters/node-adapter)
