# Runtime configuration

Separate build-time compilation, rendering, request adaptation, and framework plugin behavior.
Several eXact integrations use the word “plugin,” but they solve different problems.

## Contents

- [Build-tool compiler plugins](#build-tool-compiler-plugins)
- [Renderers and clients](#renderers-and-clients)
- [Server runtime adapters](#server-runtime-adapters)
- [eXact framework plugins](#exact-framework-plugins)

## Build-tool compiler plugins

Choose the integration for the project's build tool:

| Build tool        | Package                   | Configuration shape               |
| ----------------- | ------------------------- | --------------------------------- |
| Vite              | `@exactjs/vite-plugin`    | `exact(options)`                  |
| Webpack           | `@exactjs/webpack-plugin` | `new ExactWebpackPlugin(options)` |
| Bun               | `@exactjs/bun-plugin`     | `exact(options)`                  |
| Precompile/custom | `@exactjs/compiler`       | `exactc` or compiler APIs         |

The Vite, Webpack, and Bun plugins share the important options:

```ts
{
	target: 'default', // or 'client' / 'server'
	serverComponents: false,
	sourceMap: true
}
```

Use `target: "default"` for an ordinary single-target application. Use explicit client and server
targets for split artifact builds:

```ts
// client build
exact({
	target: 'client',
	serverComponents: true
});

// server build
exact({
	target: 'server',
	serverComponents: true
});
```

Keep `serverComponents` consistent across paired builds. Target selection also controls the
`exact-client` or `exact-server` package export condition and `.exact` facade resolution.

Inspect installed option types before using advanced settings such as `include`, `exclude`,
`importedManifests`, `manifestFiles`, asset rules, React compatibility, application roots,
configuration paths, diagnostics, profiling, or prepared plugin registries.

For Bun 1.3 applications, pass the eXact plugin directly to `Bun.build()`:

```ts
await Bun.build({
	entrypoints: ['./src/client.tsx'],
	outdir: './dist',
	target: 'browser',
	plugins: [exact({ target: 'client' })]
});
```

Use Bun's `target: "bun"` with eXact's `target: "server"` for a server bundle. The build plugin
only compiles modules that require an eXact transform; ordinary JavaScript and TypeScript continue
through Bun's native loaders.

## Renderers and clients

- Use `@exactjs/dom` to mount a client-rendered tree.
- Use `@exactjs/ssr` to create server HTML or progressive responses.
- Use `@exactjs/hydrate` to hydrate authored trees or generated client islands.
- Use `@exactjs/server` for manifest allowlisting and adapter-neutral request protocol handling.

Do not import a server runtime adapter into browser code. Do not make a build plugin responsible for
HTTP request handling.

## Server runtime adapters

Create the eXact server runtime once, then adapt it to the deployment host:

| Runtime            | Package                       | Entry                          |
| ------------------ | ----------------------------- | ------------------------------ |
| Node `http`        | `@exactjs/node-adapter`       | `createExactNodeHandler`       |
| Fetch API host     | `@exactjs/fetch-adapter`      | `createExactFetchHandler`      |
| Express            | `@exactjs/express-adapter`    | `createExactExpressMiddleware` |
| Fastify            | `@exactjs/fastify-adapter`    | `createExactFastifyHandler`    |
| Koa                | `@exactjs/koa-adapter`        | `createExactKoaMiddleware`     |
| Hapi               | `@exactjs/hapi-adapter`       | `exactHapiPlugin`              |
| Bun                | `@exactjs/bun-adapter`        | `createExactBunHandler`        |
| Deno               | `@exactjs/deno-adapter`       | `createExactDenoHandler`       |
| Cloudflare Workers | `@exactjs/cloudflare-adapter` | `createExactCloudflareHandler` |
| Generic serverless | `@exactjs/serverless-adapter` | `createExactServerlessHandler` |

Mount the handler at the endpoint declared by the eXact manifest and hydration client. Preserve
framework-specific requirements: install JSON body parsing before Express middleware, pass parsed
bodies through Fastify integrations, and account for serverless adapters that collect streams when
the gateway cannot expose a web stream.

For Hapi 21, prefer plugin registration so the adapter owns the required parsed-payload and stream
translation contract:

```ts
import { exactHapiPlugin } from '@exactjs/hapi-adapter';

await server.register({
	plugin: exactHapiPlugin,
	options: {
		runtime: exactRuntime,
		routeOptions: { auth: 'session' }
	}
});
```

The plugin registers `POST` at `exactRuntime.manifest.endpoint` (defaulting to `/__exact`), aligns
Hapi's payload limit with `runtime.limits.maxRequestBytes`, converts eXact Web streams to Node
streams, and cancels request work on disconnect. Use `createExactHapiHandler` only when the
application deliberately owns the complete Hapi route configuration.

Keep protocol validation, authorization, CSRF policy, action dispatch, and boundary allowlisting in
the central eXact server context. Runtime adapters should remain translation layers.

## eXact framework plugins

Treat `exact.config.ts` as configuration for eXact plugin packages, not as the Vite/Webpack/Bun
configuration file:

```ts
import { defineConfig } from '@exactjs/config';

export default defineConfig({
	pluginDiscovery: { mode: 'root' },
	plugins: {
		microfrontends(config) {
			config.providedPackages.push('@acme/design-system');
		},
		secrets(config) {
			config.required.push('DATABASE_URL');
		}
	}
});
```

Installed plugins may contribute bounded config, compiler, server, render, client, and testing
entries. Let each host load only its relevant projection so server implementations do not leak into
browser bundles.

Prefer generated plugin type augmentation and installed plugin documentation. Preserve dependency
ordering and protocol validation. Do not switch discovery to `mode: "all"` or widen trusted package
prefixes without an explicit trust decision. Use the build plugin's `applicationRoot`, `configPath`,
or prepared registry options only when the repository layout requires an override.
