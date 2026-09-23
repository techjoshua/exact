import type { Runtime } from '../project-generation.js';

/** Selects the host framework while keeping page and continuation handling shared. */
export function ssrPlatformFiles(runtime: Runtime, nodeSource: string): Record<string, string> {
	if (runtime === 'node') return {};
	const nodeHosts: Partial<Record<Runtime, string>> = {
		express:
			'import express from "express";\nconst app = express();\napp.use(handler);\napp.listen(port);',
		fastify:
			'import Fastify from "fastify";\nconst app = Fastify();\napp.addHook("onRequest", (request, reply, done) => { reply.hijack(); handler(request.raw, reply.raw); done(); });\nawait app.listen({ port, host: "0.0.0.0" });',
		koa: 'import Koa from "koa";\nconst app = new Koa();\napp.use(context => { context.respond = false; handler(context.req, context.res); });\napp.listen(port);',
		hapi: 'import { server as createServer } from "@hapi/hapi";\nimport { exactHapiPlugin } from "@exactjs/hapi-adapter";\nimport { exactRuntime } from "./application.js";\nconst app = createServer({ port });\nawait app.register({ plugin: exactHapiPlugin, options: { runtime: exactRuntime } });\napp.route({ method: "GET", path: "/{path*}", handler(request, h) { handler(request.raw.req, request.raw.res); return h.abandon; } });\nawait app.start();'
	};
	const nodeHost = nodeHosts[runtime];
	if (nodeHost)
		return {
			'src/server.ts':
				nodeSource
					.slice(0, nodeSource.indexOf('const server = createServer'))
					.replace('import { createServer } from "node:http";\n', '') +
				'const handler = applicationHandler({ script: "/" + entry.file, styles: (entry.css ?? []).map(file => "/" + file) }, files);\nconst port = Number(process.env.PORT ?? 3000);\n' +
				nodeHost +
				'\n'
		};
	// Fetch hosts supply static assets through their platform rather than a Node filesystem.
	return {
		'src/fetch-handler.ts': `import { createExactFetchHandler } from "@exactjs/fetch-adapter";
import { exactResponseToFetchResponse } from "@exactjs/server";
import { exactRuntime, renderApplication } from "./application.js";
import assets from "../.exact/assets.json";
const endpoint = createExactFetchHandler(exactRuntime);

/** The deployment host owns delivery of the generated dist/client assets. */
export async function handleApplication(request: Request, serveAsset?: (request: Request) => Promise<Response>): Promise<Response> {
	const url = new URL(request.url);
	if (url.pathname === "/__exact") return endpoint(request);
	if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
	if (url.pathname !== "/") return serveAsset ? serveAsset(request) : new Response("Not found", { status: 404 });
	const result = await renderApplication({ url, method: request.method, headers: request.headers, signal: request.signal, platformRequest: request }, assets);
	const response = exactResponseToFetchResponse(result);
	response.headers.set("cache-control", "no-store");
	if (request.method === "HEAD") { await response.body?.cancel(); return new Response(null, { status: response.status, headers: response.headers }); }
	return response;
}
`,
		'src/server.ts': fetchHost(runtime),
		...(runtime === 'cloudflare'
			? {
					'wrangler.json':
						JSON.stringify(
							{
								name: 'exact-app',
								main: 'dist/server/server.js',
								compatibility_date: '2026-09-01',
								assets: { directory: 'dist/client', binding: 'ASSETS', run_worker_first: true }
							},
							null,
							2
						) + '\n'
				}
			: {})
	};
}

function fetchHost(runtime: Runtime): string {
	const prelude = 'import { handleApplication } from "./fetch-handler.js";\n';
	if (runtime === 'cloudflare')
		return (
			prelude +
			'export default { fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }) { return handleApplication(request, request => env.ASSETS.fetch(request)); } };\n'
		);
	if (runtime === 'bun')
		return (
			prelude +
			`import assets from "../.exact/assets.json";
const assetFiles: readonly string[] = assets.files;
Bun.serve({ port: Number(process.env.PORT ?? 3000), fetch: request => handleApplication(request, async request => {
	const pathname = new URL(request.url).pathname;
	return assetFiles.includes(pathname) ? new Response(Bun.file(new URL("../client" + pathname, import.meta.url))) : new Response("Not found", { status: 404 });
}) });
`
		);
	if (runtime === 'deno')
		return (
			prelude +
			`import assets from "../.exact/assets.json";
const assetFiles: readonly string[] = assets.files;
declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void; readFile(path: URL): Promise<Uint8Array<ArrayBuffer>> };
Deno.serve(request => handleApplication(request, async request => {
	const pathname = new URL(request.url).pathname;
	if (!assetFiles.includes(pathname)) return new Response("Not found", { status: 404 });
	const type = pathname.endsWith(".js") ? "text/javascript" : pathname.endsWith(".css") ? "text/css" : "application/octet-stream";
	return new Response(await Deno.readFile(new URL("../client" + pathname, import.meta.url)), { headers: { "content-type": type } });
}));
`
		);
	if (runtime === 'serverless')
		return (
			prelude +
			`/** API Gateway v2 entry; deploy dist/client through the site's static asset host. */
export async function handler(event: { rawPath: string; rawQueryString?: string; requestContext: { http: { method: string } }; headers: Record<string, string>; body?: string; isBase64Encoded?: boolean }) {
	const method = event.requestContext.http.method;
	const request = new Request("https://localhost" + event.rawPath + (event.rawQueryString ? "?" + event.rawQueryString : ""), { method, headers: event.headers, ...(method === "GET" || method === "HEAD" ? {} : { body: event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64") : event.body }) });
	const response = await handleApplication(request);
	return { statusCode: response.status, headers: Object.fromEntries(response.headers), body: await response.text(), isBase64Encoded: false };
}
`
		);
	return prelude + 'export { handleApplication };\nexport default { fetch: handleApplication };\n';
}
