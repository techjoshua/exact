import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const bundlers = ['vite', 'webpack', 'bun'] as const;
export const runtimes = [
	'browser',
	'fetch',
	'node',
	'express',
	'fastify',
	'hapi',
	'koa',
	'bun',
	'deno',
	'cloudflare',
	'serverless'
] as const;
export const testRunners = ['vitest', 'jest', 'bun', 'none'] as const;

export type Bundler = (typeof bundlers)[number];
export type Runtime = (typeof runtimes)[number];
export type TestRunner = (typeof testRunners)[number];

export type CreateExactAppOptions = {
	directory: string;
	name: string;
	bundler: Bundler;
	runtime: Runtime;
	testRunner: TestRunner;
	skill: boolean;
	install?: boolean;
	packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
};

/** Creates a new eXact application in an empty directory. */
export async function createExactApp(options: CreateExactAppOptions): Promise<void> {
	const target = path.resolve(options.directory);
	validatePackageName(options.name);
	await assertEmptyTarget(target);
	await mkdir(path.join(target, 'src'), { recursive: true });
	await mkdir(path.join(target, 'public'), { recursive: true });

	const files = projectFiles(options);
	for (const [filename, contents] of Object.entries(files)) {
		const destination = path.join(target, filename);
		await mkdir(path.dirname(destination), { recursive: true });
		await writeFile(destination, contents, 'utf8');
	}
	if (options.skill) await installAgentSkill(target);
	if (options.install) installDependencies(target, options.packageManager ?? 'npm');
}

async function assertEmptyTarget(target: string): Promise<void> {
	await mkdir(target, { recursive: true });
	const entries = (await readdir(target)).filter((entry) => entry !== '.git');
	if (entries.length) {
		throw new Error(`Target directory must be empty: ${target}`);
	}
}

function validatePackageName(name: string): void {
	if (!/^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/.test(name)) {
		throw new Error(`Invalid npm package name: ${name}`);
	}
}

function projectFiles(options: CreateExactAppOptions): Record<string, string> {
	const dependencies: Record<string, string> = {
		'@exactjs/core': '^0.1.0',
		'@exactjs/dom': '^0.1.0',
		'@exactjs/jsx': '^0.1.0'
	};
	const devDependencies: Record<string, string> = {
		'@types/node': '^22.10.2',
		typescript: '^7.0.2'
	};
	const scripts: Record<string, string> = {
		typecheck: 'tsc --noEmit'
	};
	addBundler(options.bundler, devDependencies, scripts);
	addRuntime(options.runtime, dependencies, devDependencies, scripts);
	addTestRunner(options.testRunner, devDependencies, scripts);

	return {
		'package.json': `${JSON.stringify(
			{
				name: options.name,
				version: '0.1.0',
				private: true,
				type: 'module',
				scripts,
				dependencies,
				devDependencies
			},
			null,
			2
		)}\n`,
		'tsconfig.json': `${JSON.stringify(
			{
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					strict: true,
					lib: ['ES2022', 'DOM'],
					jsx: 'preserve',
					jsxImportSource: '@exactjs/jsx',
					types:
						options.testRunner === 'bun' || options.bundler === 'bun' || options.runtime === 'bun'
							? ['node', 'bun']
							: ['node'],
					noEmit: true
				},
				include: ['src', '*.config.ts', 'scripts']
			},
			null,
			2
		)}\n`,
		'.gitignore': 'node_modules\ndist\ncoverage\n.env\n',
		'index.html':
			'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="UTF-8" />\n\t\t<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n\t\t<title>eXact app</title>\n\t</head>\n\t<body>\n\t\t<div id="app"></div>\n\t\t<script type="module" src="/src/client.tsx"></script>\n\t</body>\n</html>\n',
		'public/index.html':
			'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>eXact app</title></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>\n',
		'src/App.tsx':
			'import type { Component } from "@exactjs/core";\n\nexport function App(this: Component<{ count: number }>) {\n\tthis.state.count = 0;\n\treturn () => (\n\t\t<main>\n\t\t\t<h1>eXact</h1>\n\t\t\t<p>Reactive TypeScript without a virtual DOM.</p>\n\t\t\t<button onClick={() => this.state.count++}>Count: {this.state.count}</button>\n\t\t</main>\n\t);\n}\n',
		'src/client.tsx':
			'import { render } from "@exactjs/dom";\nimport { App } from "./App.js";\nimport "./styles.css";\n\nrender(<App />, document.getElementById("app")!);\n',
		'src/styles.css':
			':root { font-family: system-ui, sans-serif; color: #18212f; background: #f6f8fb; }\nbody { margin: 0; }\nmain { max-width: 42rem; margin: 12vh auto; padding: 2rem; }\nbutton { font: inherit; padding: .65rem 1rem; cursor: pointer; }\n',
		...bundlerFiles(options.bundler, options.testRunner),
		...runtimeFiles(options.runtime),
		...testFiles(options.testRunner, options.bundler),
		'README.md': generatedReadme(options)
	};
}

function addBundler(
	bundler: Bundler,
	devDependencies: Record<string, string>,
	scripts: Record<string, string>
): void {
	if (bundler === 'vite') {
		devDependencies['@exactjs/vite-plugin'] = '^0.1.0';
		devDependencies.vite = '^8.1.5';
		scripts.dev = 'vite';
		scripts.build = 'vite build';
		scripts.preview = 'vite preview';
	} else if (bundler === 'webpack') {
		devDependencies['@exactjs/webpack-plugin'] = '^0.1.0';
		devDependencies.webpack = '^5.100.0';
		devDependencies['webpack-cli'] = '^6.0.0';
		devDependencies['webpack-dev-server'] = '^5.2.0';
		scripts.dev = 'webpack serve --mode development';
		scripts.build = 'webpack --mode production';
	} else {
		devDependencies['@exactjs/bun-plugin'] = '^0.1.0';
		devDependencies['@types/bun'] = '^1.2.0';
		scripts.dev = 'bun --watch scripts/build.ts';
		scripts.build = 'bun run scripts/build.ts';
	}
}

function addRuntime(
	runtime: Runtime,
	dependencies: Record<string, string>,
	devDependencies: Record<string, string>,
	scripts: Record<string, string>
): void {
	if (runtime === 'browser') return;
	dependencies['@exactjs/ssr'] = '^0.1.0';
	dependencies[`@exactjs/${runtime === 'serverless' ? 'serverless' : runtime}-adapter`] = '^0.1.0';
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

function addTestRunner(
	runner: TestRunner,
	devDependencies: Record<string, string>,
	scripts: Record<string, string>
): void {
	if (runner === 'none') return;
	devDependencies['@exactjs/testing'] = '^0.1.0';
	if (runner === 'vitest') {
		devDependencies['@exactjs/vitest'] = '^0.1.0';
		devDependencies.vitest = '^4.1.10';
		devDependencies.jsdom = '^25.0.1';
		scripts.test = 'vitest run';
		scripts['test:watch'] = 'vitest';
	} else if (runner === 'jest') {
		devDependencies['@exactjs/jest'] = '^0.1.0';
		devDependencies['@jest/globals'] = '^30.2.0';
		devDependencies.jest = '^30.2.0';
		devDependencies['jest-environment-jsdom'] = '^30.2.0';
		scripts.test = 'node --experimental-vm-modules ./node_modules/jest/bin/jest.js';
		scripts['test:watch'] =
			'node --experimental-vm-modules ./node_modules/jest/bin/jest.js --watch';
	} else {
		devDependencies['@exactjs/bun-test'] = '^0.1.0';
		devDependencies['@types/bun'] = '^1.3.0';
		scripts.test = 'bun test';
		scripts['test:watch'] = 'bun test --watch';
	}
}

function bundlerFiles(bundler: Bundler, runner: TestRunner): Record<string, string> {
	if (bundler === 'vite') {
		const integration =
			runner === 'vitest'
				? 'import { exactVitest } from "@exactjs/vitest";\n\nexport default defineConfig({ plugins: [exactVitest()]'
				: 'import { exact } from "@exactjs/vite-plugin";\n\nexport default defineConfig({ plugins: [exact()]';
		return {
			'vite.config.ts': `import { defineConfig } from "vite";\n${integration}${runner === 'vitest' ? ', test: { environment: "jsdom", globals: true }' : ''} });\n`
		};
	}
	if (bundler === 'webpack') {
		return {
			'webpack.config.mjs':
				'import path from "node:path";\nimport { fileURLToPath } from "node:url";\nimport { ExactWebpackPlugin } from "@exactjs/webpack-plugin";\n\nconst root = path.dirname(fileURLToPath(import.meta.url));\nexport default {\n\tentry: "./src/client.tsx",\n\toutput: { path: path.join(root, "dist"), filename: "main.js", clean: true },\n\tresolve: { extensions: [".tsx", ".ts", ".js"] },\n\tplugins: [new ExactWebpackPlugin()],\n\tdevServer: { static: path.join(root, "public"), port: 5173 }\n};\n'
		};
	}
	return {
		'scripts/build.ts':
			'import { exact } from "@exactjs/bun-plugin";\n\nconst result = await Bun.build({ entrypoints: ["./src/client.tsx"], outdir: "./dist", target: "browser", format: "esm", plugins: [exact()] });\nif (!result.success) throw new AggregateError(result.logs, "eXact build failed");\n'
	};
}

function runtimeFiles(runtime: Runtime): Record<string, string> {
	if (runtime === 'browser') return {};
	const prelude =
		'import { createExactServerRuntime } from "@exactjs/ssr";\n\nconst exactRuntime = createExactServerRuntime({ manifest: { version: 1, endpoint: "/__exact" } });\n\n';
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

function testFiles(runner: TestRunner, bundler: Bundler): Record<string, string> {
	if (runner === 'none') return {};
	const imports =
		runner === 'vitest'
			? 'import "@exactjs/vitest";\nimport { describe, expect, it } from "vitest";\n'
			: runner === 'jest'
				? 'import "@exactjs/jest";\nimport { describe, expect, it } from "@jest/globals";\n'
				: 'import { describe, expect, it } from "bun:test";\n';
	const testingPackage = runner === 'bun' ? '@exactjs/bun-test' : '@exactjs/testing';
	return {
		'src/App.test.tsx': `${imports}import { testComponent } from "${testingPackage}";\nimport { App } from "./App.js";\n\ndescribe("App", () => {\n\tit("updates reactive state", async () => {\n\t\tconst view = await testComponent(App).mount();\n\t\tconst button = view.getByRole("button");\n\t\tawait button.click();\n\t\texpect(button).toHaveText("Count: 1");\n\t\tview.unmount();\n\t});\n});\n`,
		...(runner === 'bun'
			? {
					'bunfig.toml': '[test]\npreload = ["@exactjs/bun-test/preload"]\n'
				}
			: {}),
		...(runner === 'jest'
			? {
					'jest.config.mjs':
						'import { exactJest } from "@exactjs/jest";\n\nexport default { ...exactJest() };\n'
				}
			: bundler === 'vite'
				? {}
				: {
						'vitest.config.ts':
							'import { exactVitest } from "@exactjs/vitest";\nimport { defineConfig } from "vitest/config";\n\nexport default defineConfig({ plugins: [exactVitest()], test: { environment: "jsdom", globals: true } });\n'
					})
	};
}

function generatedReadme(options: CreateExactAppOptions): string {
	const server =
		options.runtime === 'browser'
			? ''
			: '\nRun the platform endpoint in a second terminal with `npm run dev:server` when that script is available.\n';
	return `# ${options.name}\n\nAn eXact application generated with \`@exactjs/create-exact-app\`.\n\n- Build integration: ${options.bundler}\n- Runtime: ${options.runtime}\n- Test runner: ${options.testRunner}\n- Application type-checker: TypeScript 7\n\n## Development\n\n\`\`\`sh\nnpm install\nnpm run typecheck\nnpm run dev\n\`\`\`\n${server}\nEdit \`src/App.tsx\` to begin. The component setup runs once; mutate \`this.state\` directly and let the eXact compiler update the affected DOM expressions.\n\nThe application uses TypeScript 7 for command-line and editor checking. eXact's compiler packages carry the TypeScript 6 compatibility API they require, so both versions can safely coexist in the same install.\n`;
}

async function installAgentSkill(target: string): Promise<void> {
	const source = fileURLToPath(
		import.meta.resolve('@exactjs/agent-skill/skills/exact-web-development/SKILL.md')
	);
	await cp(path.dirname(source), path.join(target, '.agents/skills/exact-web-development'), {
		recursive: true
	});
}

function installDependencies(target: string, packageManager: string): void {
	const command = packageManager === 'yarn' ? 'yarn' : packageManager;
	const args = packageManager === 'yarn' ? [] : ['install'];
	const result = spawnSync(command, args, { cwd: target, stdio: 'inherit', shell: true });
	if (result.status !== 0) throw new Error(`${packageManager} install failed`);
}
