/** Generates Bun browser build and development files with explicit compiler ownership. */
export function bunProjectFiles(reactOption: string): Record<string, string> {
	return {
		'scripts/build.ts': `import { exact } from "@exactjs/bun-plugin";
import path from "node:path";

/** Builds browser assets and HTML, releasing the native compiler even on failure. */
export async function build() {
	const plugin = exact(${reactOption});
	try {
		const result = await Bun.build({ entrypoints: ["./src/client.tsx"], outdir: "./dist", target: "browser", format: "esm", plugins: [plugin] });
		if (!result.success) throw new AggregateError(result.logs, "eXact build failed");
		const files = new Map<string, Blob>();
		let styles = "";
		for (const output of result.outputs) {
			const url = "/" + path.relative("dist", output.path).split(path.sep).join("/");
			files.set(url, output);
			if (output.path.endsWith(".css")) styles += '<link rel="stylesheet" href=".' + url + '">';
		}
		const html = (await Bun.file("index.html").text()).replace("/src/client.tsx", "./client.js").replace("</head>", styles + "</head>");
		await Bun.write("dist/index.html", html);
		files.set("/index.html", new Blob([html], { type: "text/html" }));
		return files;
	} finally {
		await plugin.dispose();
	}
}

if (import.meta.main) await build();
`,
		'scripts/dev.ts': `import { watch } from "node:fs";
import { build } from "./build.js";

let files = await build();
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 5173,
	fetch(request) {
		const pathname = new URL(request.url).pathname;
		const file = files.get(pathname === "/" ? "/index.html" : pathname);
		return file ? new Response(file) : new Response("Not found", { status: 404 });
	}
});
console.log("eXact app: " + server.url + " (refresh the browser after edits)");

// Serialize rebuilds and retain the last successful assets if an edit fails to compile.
let stopped = false;
let pending = Promise.resolve();
function rebuild() {
	pending = pending.then(async () => {
		if (!stopped) files = await build();
	}).catch(console.error);
}
const watchers = [watch("src", { recursive: true }, rebuild), watch("index.html", rebuild)];
// Windows shells can disappear without forwarding a termination signal.
const parentPid = process.ppid;
const parentMonitor = setInterval(() => {
	if (parentPid <= 1) return;
	try { process.kill(parentPid, 0); } catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") void close();
	}
}, 1000);
parentMonitor.unref();

/** Stops accepting work, drains any active compiler build, and releases the server. */
export async function close() {
	if (stopped) return;
	stopped = true;
	clearInterval(parentMonitor);
	for (const watcher of watchers) watcher.close();
	await pending;
	await server.stop(true);
}
process.on("SIGINT", () => { void close(); });
process.on("SIGTERM", () => { void close(); });
`
	};
}
