import { ssrPlatformFiles } from './platform-files.js';
import type { Runtime } from '../project-generation.js';
import { ssrNodeFiles } from './node-files.js';

/** Authored full-stack source and build templates shared by generated server applications. */
export function ssrProjectFiles(
	reactTarget: false | 18 | 19,
	runtime: Runtime
): Record<string, string> {
	const compatibility = reactTarget ? `, reactCompatibility: { target: ${reactTarget} }` : '';
	return {
		'src/App.tsx': `import { TaskContext, type Component } from "@exactjs/core";

export function App(this: Component<{ count: number; serverCount: number }>) {
	this.state.count = 0;
	this.state.serverCount = 0;
	const incrementServer = async (_task: TaskContext = TaskContext.server()) => {
		this.state.serverCount++;
	};
	return () => <main>
		<h1>eXact</h1>
		<p>Rendered on the server, interactive in the browser.</p>
		<button onclick={() => this.state.count++}>Count: {this.state.count}</button>
		<button onclick={() => incrementServer()}>Server count: {this.state.serverCount}</button>
	</main>;
}
`,
		'src/client.tsx': `import { hydrate } from "@exactjs/hydrate";
import { App } from "../.exact/App.exact.client.js";
import { exactHydrationRegistration } from "../.exact/hydration-registration.js";
import "./styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("Application root is missing");
// The client discovers the framework configuration in the containing document, including sibling slots.
hydrate(<App />, root, exactHydrationRegistration);
`,
		'src/application.tsx': `import type { Child } from "@exactjs/core";
import { Document } from "@exactjs/core/document";
import { composeExactExecutorContract, createExactHydrationConfig, type ExactRequestLike } from "@exactjs/server";
import { createExactServerRuntime, renderExactRequestToHtmlResponse } from "@exactjs/ssr";
import { App } from "../.exact/App.exact.server.js";

export type Assets = { script: string; styles: string[] };
export const exactContract = composeExactExecutorContract([App], { endpoint: "/__exact" });
export const exactRuntime = createExactServerRuntime({ contract: exactContract });

function Shell(props: { children?: Child; assets: Assets }) {
	return () => <Document><html lang="en"><head>
		<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>eXact app</title>
		{props.assets.styles.map(href => <link rel="stylesheet" href={href} />)}
	</head><body><div id="app">{props.children}</div>
		<script type="module" src={props.assets.script}></script>
	</body></html></Document>;
}

/** Renders one request using the same contract used by the continuation endpoint. */
export function renderApplication(request: ExactRequestLike, assets: Assets) {
	return renderExactRequestToHtmlResponse(request, exactRuntime, () => <App />, {
		...createExactHydrationConfig(exactContract),
		documentShell: application => <Shell assets={assets}>{application}</Shell>
	});
}
`,
		'scripts/generate.mjs': `import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { compileProjectArtifacts, createExactArtifactGraph, createExactHydrationRegistrationModule } from "@exactjs/compiler";

/** Publishes the reachable component graph and compiler-owned hydration registration. */
export async function generate() {
	const rootDir = path.resolve("src");
	const outDir = path.resolve(".exact");
	const results = await compileProjectArtifacts([path.join(rootDir, "App.tsx")], {
		rootDir, outDir, serverComponents: true${compatibility}
	});
	const graph = createExactArtifactGraph(results, { packageRoot: process.cwd(), sourceRoot: rootDir, rootDir: outDir });
	await mkdir(outDir, { recursive: true });
	await writeFile(path.join(outDir, "assets.json"), JSON.stringify({ script: "/src/client.tsx", styles: ["/src/styles.css"], files: [] }));
	await writeFile(path.join(outDir, "hydration-registration.ts"), createExactHydrationRegistrationModule(graph));
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await generate();
`,
		'vite.config.ts': `import { defineConfig } from "vite";
import { exact } from "@exactjs/vite-plugin";
export default defineConfig({
	plugins: [exact({ renderMode: "hydrate"${compatibility} })],
	build: { outDir: "dist/client", manifest: true, rollupOptions: { input: "src/client.tsx" } }
});
`,
		'vite.server.config.ts': `import { defineConfig } from "vite";
import { exact } from "@exactjs/vite-plugin";
export default defineConfig({
	plugins: [exact({ target: "server", serverComponents: true${compatibility} })],
	build: { target: "node22", outDir: "dist/server", ssr: "src/server.ts", rollupOptions: { output: { entryFileNames: "server.js" } } }
});
`,
		Dockerfile: `FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server/server.js"]
`,
		'.dockerignore': 'node_modules\ndist\n.exact\n.git\n',
		...ssrNodeFiles(),
		...ssrPlatformFiles(runtime, ssrNodeFiles()['src/server.ts']!)
	};
}
