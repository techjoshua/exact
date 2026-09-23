/** Node host, asset serving, and development ownership for the full-stack starter. */
export function ssrNodeFiles(): Record<string, string> {
	return {
		'src/node-handler.ts': `import { readFile } from "node:fs/promises";
import path from "node:path";
import { cancelNodeResponseBody, createExactNodeHandler, createNodeHandler, writeNodeResponse } from "@exactjs/node-adapter";
import { exactRuntime, renderApplication, type Assets } from "./application.js";

const endpoint = createExactNodeHandler(exactRuntime);

/** Owns page cancellation and serves only files named by the build manifest. */
export function applicationHandler(assets: Assets, files = new Map<string, string>()) {
	const page = createNodeHandler(async (request, response, signal) => {
		const url = new URL(request.url ?? "/", "http://localhost");
		if (request.method !== "GET" && request.method !== "HEAD") {
			response.writeHead(405, { allow: "GET, HEAD" }); response.end(); return;
		}
		const file = files.get(url.pathname);
		if (file) {
			response.statusCode = 200;
			const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json" };
			response.setHeader("content-type", types[path.extname(file)] ?? "application/octet-stream");
			response.setHeader("cache-control", "public, max-age=0, must-revalidate");
			response.end(request.method === "HEAD" ? undefined : await readFile(file)); return;
		}
		if (url.pathname !== "/") { response.writeHead(404); response.end("Not found"); return; }
		const result = await renderApplication({ url, method: request.method, headers: request.headers, signal, platformRequest: request }, assets);
		response.setHeader("cache-control", "no-store");
		if (request.method === "HEAD") {
			await cancelNodeResponseBody(result, "HEAD response");
			response.writeHead(result.status, result.headers); response.end();
		} else await writeNodeResponse(response, result, signal);
	});
	return (request: Parameters<typeof page>[0], response: Parameters<typeof page>[1]) => {
		if (new URL(request.url ?? "/", "http://localhost").pathname === "/__exact") endpoint(request, response);
		else page(request, response);
	};
}
`,
		'src/server.ts': `import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { applicationHandler } from "./node-handler.js";
import assets from "../.exact/assets.json";

const root = path.resolve(import.meta.dirname, "../client");
const manifest = JSON.parse(await readFile(path.join(root, ".vite/manifest.json"), "utf8")) as Record<string, { file: string; css?: string[]; isEntry?: boolean }>;
const entry = manifest["src/client.tsx"];
if (!entry) throw new Error("Client entry is missing from the Vite manifest");
const assetFiles: readonly string[] = assets.files;
const files = new Map(assetFiles.map(file => [file, path.join(root, file.slice(1))]));
const server = createServer(applicationHandler({ script: "/" + entry.file, styles: (entry.css ?? []).map(file => "/" + file) }, files));
server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => server.close());
`,
		'scripts/dev.mjs': `import path from "node:path";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "vite";
import { generate } from "./generate.mjs";
import { installDevelopmentProcessLifecycle } from "./development-process-lifecycle.mjs";

await generate();
const vite = await createServer({ appType: "custom", server: { middlewareMode: true } });
let generation = Promise.resolve();
const server = createHttpServer((request, response) => {
	vite.middlewares(request, response, async () => {
		try {
			await generation;
			const { applicationHandler } = await vite.ssrLoadModule("/src/node-handler.ts");
			applicationHandler({ script: "/src/client.tsx", styles: ["/src/styles.css"] })(request, response);
		} catch (error) { vite.ssrFixStacktrace(error); console.error(error); response.writeHead(500); response.end("Application failed"); }
	});
});
const changed = file => {
	if (!file.split(path.sep).join("/").includes("/src/") || !/\\.[cm]?[jt]sx?$/.test(file)) return;
	generation = generation.catch(() => {}).then(generate).then(() => {
		vite.moduleGraph.invalidateAll(); vite.ws.send({ type: "full-reload" });
	});
	void generation.catch(error => console.error(error));
};
vite.watcher.on("change", changed);
vite.watcher.on("add", changed);
vite.watcher.on("unlink", changed);
const lifecycle = installDevelopmentProcessLifecycle({ label: "eXact application", close: async () => {
	vite.watcher.off("change", changed); vite.watcher.off("add", changed); vite.watcher.off("unlink", changed);
	try {
		if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	} finally { await generation.catch(() => {}); await vite.close(); }
} });
try {
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(Number(process.env.PORT ?? 3000), "127.0.0.1", () => { server.off("error", reject); resolve(); });
	});
}
catch (error) { lifecycle.dispose(); await vite.close(); throw error; }
`,
		'scripts/build.mjs': `import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { generate } from "./generate.mjs";
import { buildExactViteApplication } from "@exactjs/vite-plugin/build";
await generate();
await buildExactViteApplication(["vite.config.ts", "vite.server.config.ts"], { async afterBuild(config) {
if (config !== "vite.config.ts") return;
const manifest = JSON.parse(await readFile("dist/client/.vite/manifest.json", "utf8"));
const entry = manifest["src/client.tsx"];
const clientRoot = path.resolve("dist/client");
const files = (await readdir(clientRoot, { recursive: true, withFileTypes: true }))
	.filter(file => file.isFile())
	.map(file => path.relative(clientRoot, path.join(file.parentPath, file.name)).split(path.sep).join("/"))
	.filter(file => !file.startsWith(".vite/"))
	.map(file => "/" + file);
await writeFile(".exact/assets.json", JSON.stringify({ script: "/" + entry.file, styles: (entry.css ?? []).map(file => "/" + file), files }));
} });
`
	};
}
