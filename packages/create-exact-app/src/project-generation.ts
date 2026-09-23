import { generatedReadme } from './project-readme.js';
import { addRuntime, runtimeFiles } from './runtime-project-files.js';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ssrProjectFiles } from './ssr/project-files.js';
import { bunProjectFiles } from './bun-project-files.js';

/** Build integrations available to generated applications. */
export const bundlers = ['vite', 'webpack', 'bun'] as const;
/** Runtime adapters available to generated applications. */
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
/** Unit-test integrations available to generated applications. */
export const testRunners = ['vitest', 'jest', 'bun', 'none'] as const;

/** A build integration accepted by the application generator. */
export type Bundler = (typeof bundlers)[number];
/** A server or browser runtime accepted by the application generator. */
export type Runtime = (typeof runtimes)[number];
/** A test integration accepted by the application generator. */
export type TestRunner = (typeof testRunners)[number];
/** React compatibility target optionally included in a generated application. */
export type ReactCompatibilityTarget = false | 18 | 19;

/** Describes the application files and optional installation work to generate. */
export type CreateExactAppOptions = {
	/** Delivery format; server is the default for a server runtime. */
	output?: 'browser' | 'server' | 'single-file';
	/** Explicitly scaffold only transport operations, without SSR. */
	operationsOnly?: boolean;
	directory: string;
	name: string;
	bundler: Bundler;
	runtime: Runtime;
	testRunner: TestRunner;
	skill: boolean;
	reactCompatibility?: ReactCompatibilityTarget;
	install?: boolean;
	packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
};

/** Creates a new eXact application in an empty directory. */
export async function createExactApp(options: CreateExactAppOptions): Promise<void> {
	const output = options.output ?? (options.runtime === 'browser' ? 'browser' : 'server');
	if (output === 'single-file' && (options.runtime !== 'browser' || options.bundler !== 'vite'))
		throw new Error('Single-file output requires the Vite bundler and browser runtime');
	if (output === 'server' && options.runtime === 'browser')
		throw new Error('Server output requires a server runtime');
	if (output === 'server' && !options.operationsOnly && options.bundler !== 'vite')
		throw new Error(
			'The SSR starter requires Vite. Use operationsOnly for a Webpack or Bun transport starter.'
		);
	if (options.operationsOnly && (options.runtime === 'browser' || output === 'single-file'))
		throw new Error('Operations-only output requires a server runtime');
	const target = path.resolve(options.directory);
	validatePackageName(options.name);
	validatePackageManager(options.packageManager);
	await assertEmptyTarget(target);
	await mkdir(path.join(target, 'src'), { recursive: true });
	await mkdir(path.join(target, 'public'), { recursive: true });

	const files = projectFiles({
		...options,
		output,
		operationsOnly:
			options.operationsOnly || (output === 'browser' && options.runtime !== 'browser')
	});
	if (options.bundler === 'vite') {
		files['scripts/development-process-lifecycle.mjs'] = await readFile(
			new URL('../templates/development-process-lifecycle.mjs', import.meta.url),
			'utf8'
		);
		if (output !== 'server' || options.operationsOnly)
			files['scripts/dev.mjs'] = `import { createServer } from "vite";
import { installDevelopmentProcessLifecycle } from "./development-process-lifecycle.mjs";
const server = await createServer();
const lifecycle = installDevelopmentProcessLifecycle({ label: "eXact Vite server", close: () => server.close() });
try { await server.listen(); server.printUrls(); }
catch (error) { lifecycle.dispose(); await server.close(); throw error; }
`;
	}
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

function validatePackageManager(
	value: unknown
): asserts value is CreateExactAppOptions['packageManager'] {
	if (value !== undefined && !['npm', 'pnpm', 'yarn', 'bun'].includes(String(value))) {
		throw new Error(`Unsupported package manager: ${String(value)}`);
	}
}

function projectFiles(options: CreateExactAppOptions): Record<string, string> {
	const dependencies: Record<string, string> = {
		'@exactjs/core': '^0.6.0',
		'@exactjs/dom': '^0.6.0',
		'@exactjs/jsx': '^0.6.0'
	};
	const devDependencies: Record<string, string> = {
		'@exactjs/compiler': '^0.6.0',
		'@types/node': '^22.10.2',
		typescript: '^7.0.2'
	};
	const scripts: Record<string, string> = {
		typecheck: 'exactc --check --project tsconfig.json'
	};
	addBundler(options.bundler, devDependencies, scripts);
	addReactCompatibility(options.reactCompatibility ?? false, dependencies, devDependencies);
	addRuntime(options.runtime, dependencies, devDependencies, scripts);
	addTestRunner(options.testRunner, devDependencies, scripts);
	const server = options.output === 'server' && !options.operationsOnly;
	if (server) {
		dependencies['@exactjs/hydrate'] = '^0.6.0';
		dependencies['@exactjs/node-adapter'] = '^0.6.0';
		dependencies['@exactjs/fetch-adapter'] = '^0.6.0';
		scripts.dev = 'node scripts/dev.mjs';
		scripts.generate = 'node scripts/generate.mjs';
		scripts.build = 'node scripts/build.mjs';
		scripts.start =
			options.runtime === 'bun'
				? 'bun dist/server/server.js'
				: options.runtime === 'deno'
					? 'deno run --allow-net --allow-read dist/server/server.js'
					: options.runtime === 'cloudflare'
						? 'wrangler dev'
						: 'node dist/server/server.js';
		if (options.runtime === 'fetch' || options.runtime === 'serverless') delete scripts.start;
		scripts.typecheck = 'npm run generate && exactc --check --project tsconfig.json';
		delete scripts['dev:server'];
		delete scripts['start:server'];
		delete scripts.preview;
	}

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
					types: [
						'node',
						...(options.testRunner === 'bun' ||
						options.bundler === 'bun' ||
						options.runtime === 'bun'
							? ['bun']
							: []),
						...(options.reactCompatibility
							? [`@exactjs/react-compat/types${options.reactCompatibility}`]
							: [])
					],
					resolveJsonModule: true,
					noEmit: true
				},
				include: ['src', '*.config.ts', 'scripts']
			},
			null,
			2
		)}\n`,
		'.gitignore': 'node_modules\ndist\n.exact\ncoverage\n.env\n',
		'index.html': browserHtml(options.bundler),
		'src/App.tsx':
			'import type { Component } from "@exactjs/core";\n\nexport function App(this: Component<{ count: number }>) {\n\tthis.state.count = 0;\n\treturn () => (\n\t\t<main>\n\t\t\t<h1>eXact</h1>\n\t\t\t<p>Reactive TypeScript without a virtual DOM.</p>\n\t\t\t<button onClick={() => this.state.count++}>Count: {this.state.count}</button>\n\t\t</main>\n\t);\n}\n',
		'src/client.tsx':
			'import { render } from "@exactjs/dom";\nimport { App } from "./App.js";\nimport "./styles.css";\n\nrender(<App />, document.getElementById("app")!);\n',
		'src/env.d.ts':
			(options.bundler === 'vite' ? '/// <reference types="vite/client" />\n' : '') +
			'declare module "*.css" {}\n',
		'src/styles.css':
			':root { font-family: system-ui, sans-serif; color: #18212f; background: #f6f8fb; }\nbody { margin: 0; }\nmain { max-width: 42rem; margin: 12vh auto; padding: 2rem; }\nbutton { font: inherit; padding: .65rem 1rem; cursor: pointer; }\n',
		...bundlerFiles(options.bundler, options.testRunner, options.reactCompatibility ?? false),
		...runtimeFiles(options.runtime),
		...testFiles(options.testRunner, options.bundler, options.reactCompatibility ?? false),
		...(server ? ssrProjectFiles(options.reactCompatibility ?? false, options.runtime) : {}),
		...((server || options.output === 'single-file') && options.testRunner === 'vitest'
			? {
					'vitest.config.ts': `import { defineConfig } from "vitest/config";\nimport { exactVitest } from "@exactjs/vitest";\nexport default defineConfig({ plugins: [exactVitest(${options.reactCompatibility ? `{ compiler: { reactCompatibility: { target: ${options.reactCompatibility} } } }` : ''})], test: { environment: "jsdom" } });\n`
				}
			: {}),
		...(options.output === 'single-file'
			? {
					'vite.config.ts': `import { defineConfig } from "vite";\nimport { exactSingleFile } from "@exactjs/vite-plugin";\nexport default defineConfig({ plugins: [exactSingleFile(${options.reactCompatibility ? `{ reactCompatibility: { target: ${options.reactCompatibility} } }` : ''})] });\n`
				}
			: {}),
		'README.md': generatedReadme(options)
	};
}

function browserHtml(bundler: Bundler): string {
	const script =
		bundler === 'webpack' ? '' : '<script type="module" src="/src/client.tsx"></script>';
	return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>eXact app</title>\n</head>\n<body>\n<div id="app"></div>\n${script}\n</body>\n</html>\n`;
}

function addReactCompatibility(
	target: ReactCompatibilityTarget,
	dependencies: Record<string, string>,
	devDependencies: Record<string, string>
): void {
	if (!target) return;
	dependencies['@exactjs/react-compat'] = '^0.6.0';
	dependencies['@exactjs/react-dom-compat'] = '^0.6.0';
	devDependencies.react = target === 18 ? '^18.3.1' : '^19.2.0';
	devDependencies['react-dom'] = target === 18 ? '^18.3.1' : '^19.2.0';
	devDependencies['@types/react'] = target === 18 ? '^18.3.0' : '^19.2.0';
	devDependencies['@types/react-dom'] = target === 18 ? '^18.3.0' : '^19.2.0';
}

function addBundler(
	bundler: Bundler,
	devDependencies: Record<string, string>,
	scripts: Record<string, string>
): void {
	if (bundler === 'vite') {
		devDependencies['@exactjs/vite-plugin'] = '^0.6.0';
		devDependencies.vite = '^8.1.5';
		scripts.dev = 'node scripts/dev.mjs';
		scripts.build = 'vite build';
		scripts.preview = 'vite preview';
	} else if (bundler === 'webpack') {
		devDependencies['@exactjs/webpack-plugin'] = '^0.6.0';
		devDependencies.webpack = '^5.101.0';
		devDependencies['html-webpack-plugin'] = '^5.6.3';
		devDependencies['webpack-cli'] = '^6.0.0';
		devDependencies['webpack-dev-server'] = '^6.0.0';
		scripts.dev = 'webpack serve --mode development';
		scripts.build = 'webpack --mode production';
	} else {
		devDependencies['@exactjs/bun-plugin'] = '^0.6.0';
		devDependencies['@types/bun'] = '^1.2.0';
		scripts.dev = 'bun run scripts/dev.ts';
		scripts.build = 'bun run scripts/build.ts';
	}
}

function addTestRunner(
	runner: TestRunner,
	devDependencies: Record<string, string>,
	scripts: Record<string, string>
): void {
	if (runner === 'none') return;
	devDependencies['@exactjs/testing'] = '^0.6.0';
	if (runner === 'vitest') {
		devDependencies['@exactjs/vitest'] = '^0.6.0';
		devDependencies.vitest = '^4.1.10';
		devDependencies.jsdom = '^25.0.1';
		scripts.test = 'vitest run';
		scripts['test:watch'] = 'vitest';
	} else if (runner === 'jest') {
		devDependencies['@exactjs/jest'] = '^0.6.0';
		devDependencies['@jest/globals'] = '^30.2.0';
		devDependencies.jest = '^30.2.0';
		devDependencies['jest-environment-jsdom'] = '^30.2.0';
		scripts.test = 'node --experimental-vm-modules ./node_modules/jest/bin/jest.js';
		scripts['test:watch'] =
			'node --experimental-vm-modules ./node_modules/jest/bin/jest.js --watch';
	} else {
		devDependencies['@exactjs/bun-test'] = '^0.6.0';
		devDependencies['@types/bun'] = '^1.3.0';
		scripts.test = 'bun --conditions=browser test';
		scripts['test:watch'] = 'bun --conditions=browser test --watch';
	}
}

function bundlerFiles(
	bundler: Bundler,
	runner: TestRunner,
	reactCompatibility: ReactCompatibilityTarget
): Record<string, string> {
	const reactOption = reactCompatibility
		? `{ reactCompatibility: { target: ${reactCompatibility} } }`
		: '';
	if (bundler === 'vite') {
		const integration =
			runner === 'vitest'
				? `import { exactVitest } from "@exactjs/vitest";\n\nexport default defineConfig({ plugins: [exactVitest(${reactCompatibility ? `{ compiler: ${reactOption} }` : ''})]`
				: `import { exact } from "@exactjs/vite-plugin";\n\nexport default defineConfig({ plugins: [exact(${reactOption})]`;
		return {
			'vite.config.ts': `import { defineConfig } from "${runner === 'vitest' ? 'vitest/config' : 'vite'}";\n${integration}${runner === 'vitest' ? ', test: { environment: "jsdom", globals: true }' : ''} });\n`
		};
	}
	if (bundler === 'webpack') {
		return {
			'webpack.config.mjs': `import path from "node:path";\nimport { fileURLToPath } from "node:url";\nimport { ExactWebpackPlugin } from "@exactjs/webpack-plugin";\nimport HtmlWebpackPlugin from "html-webpack-plugin";\n\nconst root = path.dirname(fileURLToPath(import.meta.url));\nexport default {\n\tentry: "./src/client.tsx",\n\toutput: { path: path.join(root, "dist"), filename: "main.js", clean: true },\n\tresolve: { extensions: [".tsx", ".ts", ".js"], extensionAlias: { ".js": [".js", ".ts", ".tsx"] } },\n\tplugins: [new ExactWebpackPlugin(${reactOption}), new HtmlWebpackPlugin({ template: "./index.html" })],\n\tdevServer: { static: path.join(root, "public"), port: 5173 }\n};\n`
		};
	}
	return bunProjectFiles(reactOption);
}

function testFiles(
	runner: TestRunner,
	bundler: Bundler,
	reactCompatibility: ReactCompatibilityTarget
): Record<string, string> {
	if (runner === 'none') return {};
	const imports =
		runner === 'vitest'
			? 'import "@exactjs/vitest";\nimport { describe, expect, it } from "vitest";\n'
			: runner === 'jest'
				? 'import "@exactjs/jest";\nimport { describe, expect, it } from "@jest/globals";\n'
				: 'import { describe, expect, it } from "bun:test";\n';
	const testingPackage = runner === 'bun' ? '@exactjs/bun-test' : '@exactjs/testing';
	return {
		'src/App.test.tsx': `${imports}import { testComponent } from "${testingPackage}";\nimport { App } from "./App.js";\n\ndescribe("App", () => {\n\tit("updates reactive state", async () => {\n\t\tconst view = await testComponent(App).mount();\n\t\tconst button = view.getByRole("button", { name: "Count: 0" });\n\t\tawait button.click();\n\t\texpect(button).toHaveText("Count: 1");\n\t\tview.unmount();\n\t});\n});\n`,
		...(runner === 'bun'
			? {
					'bunfig.toml': reactCompatibility
						? '[test]\npreload = ["./test-preload.ts"]\n'
						: '[test]\npreload = ["@exactjs/bun-test/preload"]\n',
					...(reactCompatibility
						? {
								'test-preload.ts': `import { configureExactBunTest } from "@exactjs/bun-test";\n\nconfigureExactBunTest({ compiler: { reactCompatibility: { target: ${reactCompatibility} } } });\n`
							}
						: {})
				}
			: {}),
		...(runner === 'jest'
			? {
					'jest.config.mjs': `import { exactJest } from "@exactjs/jest";\n\nexport default { ...exactJest(${reactCompatibility ? `{ compiler: { reactCompatibility: { target: ${reactCompatibility} } } }` : ''}) };\n`
				}
			: runner !== 'vitest' || bundler === 'vite'
				? {}
				: {
						'vitest.config.ts': `import { exactVitest } from "@exactjs/vitest";\nimport { defineConfig } from "vitest/config";\n\nexport default defineConfig({ plugins: [exactVitest(${reactCompatibility ? `{ compiler: { reactCompatibility: { target: ${reactCompatibility} } } }` : ''})], test: { environment: "jsdom", globals: true } });\n`
					})
	};
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
	validatePackageManager(packageManager);
	let executable: string = packageManager;
	let args = packageManager === 'yarn' ? [] : ['install'];
	if (packageManager === 'npm' && process.env.npm_execpath) {
		executable = process.execPath;
		args = [process.env.npm_execpath, ...args];
	} else if (process.platform === 'win32') {
		// Windows command shims cannot be spawned directly. Only the allowlisted package
		// manager and fixed install arguments enter cmd; the target remains a cwd argument.
		executable = process.env.ComSpec ?? 'cmd.exe';
		args = ['/d', '/s', '/c', [packageManager, ...args].join(' ')];
	}
	const result = spawnSync(executable, args, {
		cwd: target,
		stdio: 'inherit',
		shell: false,
		windowsHide: true
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`${packageManager} install failed`);
}
