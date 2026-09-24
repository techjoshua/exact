import type { Runtime } from './project-generation.js';

/** Selects runtime host dependencies and transport-only launch scripts. */
export function addRuntime(
	runtime: Runtime,
	dependencies: Record<string, string>,
	devDependencies: Record<string, string>,
	scripts: Record<string, string>
): void {
	if (runtime === 'browser') return;
	dependencies['@exactjs/ssr'] = '^0.6.0';
	dependencies['@exactjs/server'] = '^0.6.0';
	dependencies[`@exactjs/${runtime === 'serverless' ? 'serverless' : runtime}-adapter`] = '^0.6.0';
	if (['node', 'express', 'fastify', 'hapi', 'koa'].includes(runtime)) {
		devDependencies.tsx = '^4.20.0';
		scripts['dev:server'] = 'tsx watch src/server.ts';
		scripts['start:server'] = 'tsx src/server.ts';
	}
	if (runtime === 'express') {
		dependencies.express = '^5.1.0';
		devDependencies['@types/express'] = '^5.0.0';
	}
	if (runtime === 'fastify') dependencies.fastify = '^5.6.0';
	if (runtime === 'hapi') dependencies['@hapi/hapi'] = '^21.4.0';
	if (runtime === 'koa') {
		dependencies.koa = '^3.0.0';
		devDependencies['@types/koa'] = '^2.15.0';
	}
	if (runtime === 'bun') {
		devDependencies['@types/bun'] = '^1.2.0';
		scripts['dev:server'] = 'bun --watch src/server.ts';
	}
	if (runtime === 'deno') scripts['dev:server'] = 'deno run --allow-net src/server.ts';
	if (runtime === 'cloudflare') {
		devDependencies.wrangler = '^4.0.0';
		scripts['dev:server'] = 'wrangler dev src/server.ts';
	}
}

/** Generates the explicit operations-only runtime example. */
export function runtimeFiles(runtime: Runtime): Record<string, string> {
	if (runtime === 'browser') return {};
	const prelude =
		'import { composeExactExecutorContract } from "@exactjs/server";\nimport { createExactServerRuntime } from "@exactjs/ssr";\n\nconst exactContract = composeExactExecutorContract([], { endpoint: "/__exact" });\nconst exactRuntime = createExactServerRuntime({ contract: exactContract });\n\n';
	const sources: Record<Exclude<Runtime, 'browser'>, string> = {
		fetch:
			'import { createExactFetchHandler } from "@exactjs/fetch-adapter";\n\nexport const handleExactRequest = createExactFetchHandler(exactRuntime);\n',
		node: 'import { createExactNodeHandler } from "@exactjs/node-adapter";\nimport { createServer } from "node:http";\n\ncreateServer(createExactNodeHandler(exactRuntime)).listen(3000, () => console.log("eXact server: http://localhost:3000"));\n',
		express:
			'import { createExactExpressMiddleware } from "@exactjs/express-adapter";\nimport express from "express";\n\nconst app = express();\napp.use(express.json());\napp.post("/__exact", createExactExpressMiddleware(exactRuntime));\napp.listen(3000, () => console.log("eXact server: http://localhost:3000"));\n',
		fastify:
			'import { createExactFastifyHandler } from "@exactjs/fastify-adapter";\nimport Fastify from "fastify";\n\nconst app = Fastify();\napp.post("/__exact", createExactFastifyHandler(exactRuntime));\nawait app.listen({ port: 3000 });\n',
		hapi: 'import { exactHapiPlugin } from "@exactjs/hapi-adapter";\nimport { server as createHapiServer } from "@hapi/hapi";\n\nconst server = createHapiServer({ port: 3000 });\nawait server.register({ plugin: exactHapiPlugin, options: { runtime: exactRuntime } });\nawait server.start();\n',
		koa: 'import { createExactKoaMiddleware } from "@exactjs/koa-adapter";\nimport Koa from "koa";\n\nconst app = new Koa();\napp.use(createExactKoaMiddleware(exactRuntime));\napp.listen(3000);\n',
		bun: 'import { createExactBunHandler } from "@exactjs/bun-adapter";\n\nBun.serve({ port: 3000, fetch: createExactBunHandler(exactRuntime) });\n',
		deno: 'import { createExactDenoHandler } from "@exactjs/deno-adapter";\n\ndeclare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): unknown };\nDeno.serve(createExactDenoHandler(exactRuntime));\n',
		cloudflare:
			'import { createExactCloudflareHandler } from "@exactjs/cloudflare-adapter";\n\ntype WorkerContext = { waitUntil(promise: Promise<unknown>): void };\nconst exact = createExactCloudflareHandler(exactRuntime);\nexport default { fetch(request: Request, env: unknown, context: WorkerContext) { return exact(request, env, context); } };\n',
		serverless:
			'import { createExactServerlessHandler } from "@exactjs/serverless-adapter";\n\nexport const handler = createExactServerlessHandler(exactRuntime);\n'
	};
	return { 'src/server.ts': prelude + sources[runtime] };
}
