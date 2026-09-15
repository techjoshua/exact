# @exactjs/hapi-adapter

Hapi 21 integration for eXact server endpoints.

## Plugin setup

```ts
import { exactHapiPlugin } from '@exactjs/hapi-adapter';

await server.register({
	plugin: exactHapiPlugin,
	options: { runtime: exactRuntime }
});
```

The plugin registers a POST route at the runtime endpoint, retains buffered raw bytes for runtime decoding or gateway forwarding,
applies the runtime request-size limit, adapts streaming responses, and cancels work when the
client disconnects.

Use `routeOptions` for authentication, CORS, and other Hapi route settings. Use
`createExactHapiHandler()` instead when the application needs to own route registration
directly. Application document routes and static assets remain separate from the eXact endpoint.

[Documentation](https://techjoshua.github.io/exact/#/runtimes) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/framework-adapters/hapi-adapter)
