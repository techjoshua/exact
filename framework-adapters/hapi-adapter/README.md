# @exactjs/hapi-adapter

Hapi 21 integration for eXact server endpoints. The package provides an idiomatic
Hapi plugin as well as a direct route handler for applications that need to own
their route registration.

## Register the plugin

```ts
import { server as createHapiServer } from '@hapi/hapi';
import { exactHapiPlugin } from '@exactjs/hapi-adapter';

const server = createHapiServer({ port: 3000 });

await server.register({
	plugin: exactHapiPlugin,
	options: {
		runtime: exactRuntime
	}
});

await server.start();
```

The plugin registers a `POST` route at `exactRuntime.manifest.endpoint`, falling
back to `/__exact` when the manifest does not specify one. The endpoint must be
an absolute path.

The registered route:

- Uses Hapi's parsed, buffered `request.payload`.
- Accepts JSON by default.
- Uses `runtime.limits.maxRequestBytes`, or eXact's 4 MiB request default, as
  Hapi's `payload.maxBytes`.
- Converts eXact Web `ReadableStream` responses to Node `Readable` streams for
  Hapi.
- Aborts eXact request work and response streams when Hapi reports a client
  disconnect.
- Passes the original Hapi `Request` through `context.platformRequest`.

## Configure the route

Use `routeOptions` for ordinary Hapi route settings and `payload` for payload
settings that do not change eXact's required buffered parsing mode:

```ts
await server.register({
	plugin: exactHapiPlugin,
	options: {
		runtime: exactRuntime,
		routeOptions: {
			auth: 'session',
			cors: {
				origin: ['https://app.example.com'],
				credentials: true
			},
			tags: ['api', 'exact']
		},
		payload: {
			timeout: 15_000
		}
	}
});
```

The plugin controls `payload.output: "data"` and `payload.parse: true` because
the eXact protocol consumes a parsed JSON envelope. Other payload options,
including `maxBytes`, `allow`, `timeout`, and `failAction`, remain configurable.
When overriding `maxBytes`, keep it aligned with
`runtime.limits.maxRequestBytes`; Hapi rejects oversized requests before eXact
protocol validation runs.

Register the plugin more than once only when the server hosts separate eXact
runtimes with distinct manifest endpoints.

## Direct handler

For manual route ownership:

```ts
import { createExactHapiHandler } from '@exactjs/hapi-adapter';

server.route({
	method: 'POST',
	path: exactRuntime.manifest.endpoint ?? '/__exact',
	options: {
		payload: {
			output: 'data',
			parse: true,
			allow: 'application/json',
			maxBytes: exactRuntime.limits?.maxRequestBytes ?? 4 * 1024 * 1024
		}
	},
	handler: createExactHapiHandler(exactRuntime)
});
```

Prefer the plugin unless the application needs to compose its own handler or
route registration.

## SSR

The plugin owns the eXact action and refresh endpoint; it does not register the
application's document routes or static assets. A Hapi application can render
documents through `@exactjs/ssr` in its own `GET` handlers. Install the
concurrency-safe Node request storage once before asynchronous SSR that uses
ambient request helpers:

```ts
import { installNodeRequestContext } from '@exactjs/request/node';

installNodeRequestContext();
```

For progressive document responses, convert the Web stream returned by eXact
to a Node `Readable` before passing it to `h.response()`, and connect
`request.events.disconnect` or the raw response `close` event to the render's
abort signal. The endpoint plugin already performs both operations for action
and refresh responses.
