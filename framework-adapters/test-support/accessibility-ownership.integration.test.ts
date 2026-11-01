import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { chromium } from 'playwright';
import { NativeCompilerProcess } from '@exactjs/compiler';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

it.each(['vite', 'bun', 'webpack'] as const)(
	'preserves compiled accessibility ownership in Chromium via %s',
	async (adapter) => {
		const parent = path.resolve('.tmp/accessibility-ownership');
		await mkdir(parent, { recursive: true });
		const root = await mkdtemp(path.join(parent, adapter + '-'));
		onTestFinished(() => rm(root, { recursive: true, force: true }));
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ name: '@fixture/accessibility-ownership', private: true, type: 'module' })
		);
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'ESNext',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'preserve',
					strict: true
				},
				include: ['*.tsx', '*.ts']
			})
		);
		await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		const fixture = path.resolve(
			'packages/component-composition-corpus/test-support/accessibility'
		);
		await writeFile(
			path.join(root, 'ownership.fixtures.tsx'),
			await readFile(path.join(fixture, 'ownership.fixtures.tsx'), 'utf8')
		);
		await writeFile(
			path.join(root, 'ownership-browser.ts'),
			await readFile(path.join(fixture, 'ownership-browser.ts'), 'utf8')
		);
		await writeFile(
			path.join(root, 'entry.ts'),
			"export {verifyAccessibilityOwnership as verify} from './ownership-browser.js';"
		);
		const native = new NativeCompilerProcess({ executable: process.env.EXACT_COMPILER_EXECUTABLE });
		try {
			for (const target of ['client', 'server'] as const) {
				const id = path.join(root, 'ownership.fixtures.tsx');
				const response = native.request({
					kind: 'compile',
					id,
					source: await readFile(id, 'utf8'),
					root,
					configFile: path.join(root, 'tsconfig.json'),
					target,
					diagnostics: 'semantic'
				});
				expect(response.error).toBeUndefined();
				expect(response.diagnostics).toEqual([]);
				for (const component of response.analysis.components)
					expect(component.placement).toBe('isomorphic');
			}
		} finally {
			native.dispose();
		}
		// The maintained build owner expects an authored entry.tsx path.
		await writeFile(
			path.join(root, 'entry.tsx'),
			"export {verifyAccessibilityOwnership as verify} from './ownership-browser.js';"
		);
		await buildBrowser(adapter, root);
		const name = (await readdir(path.join(root, 'out-client'))).find((n) =>
			/^entry\.(?:js|mjs|cjs)$/.test(n)
		);
		expect(name).toBeTruthy();
		const code = await readFile(path.join(root, 'out-client', name!), 'utf8');
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on('pageerror', (e) => errors.push(e.message));
			await page.route('https://accessibility-ownership.test/**', (route) =>
				route.fulfill({
					contentType: route.request().url().endsWith('entry.js') ? 'text/javascript' : 'text/html',
					body: route.request().url().endsWith('entry.js') ? code : '<!doctype html><body></body>'
				})
			);
			await page.goto('https://accessibility-ownership.test/');
			const result =
				adapter === 'webpack'
					? await page.evaluate((source) => {
							const module = { exports: {} };
							new Function('exports', 'module', source)(module.exports, module);
							return (module.exports as { verify: () => unknown }).verify();
						}, code)
					: await page.evaluate(
							"(async()=>{const m=await import('https://accessibility-ownership.test/entry.js');return m.verify();})()"
						);
			expect(result).toEqual({
				initial: true,
				retained: true,
				restored: true,
				disposed: true,
				boundaryOwned: true,
				republished: true,
				externalRestored: true,
				listenerReleased: true,
				progress: true,
				reports: []
			});
			expect(errors).toEqual([]);
			expect(await page.locator('body').evaluate((el) => el.childNodes.length)).toBe(0);
		} finally {
			await browser.close();
		}
	},
	120000
);

/** Uses each adapter's native browser target, including browser package export conditions. */
async function buildBrowser(adapter: 'vite' | 'bun' | 'webpack', root: string) {
	if (adapter === 'vite') {
		await buildDiagnosticFixture(adapter, root, 'client', false, true);
		return;
	}
	const options = {
		applicationRoot: root,
		target: 'client',
		serverComponents: true,
		reactCompatibility: false
	};
	if (adapter === 'bun') {
		const { execFile } = await import('node:child_process');
		const { promisify } = await import('node:util');
		const script = path.join(root, 'build.mjs');
		await writeFile(
			script,
			`import {exact} from ${JSON.stringify(new URL('../bun-plugin/dist/index.js', import.meta.url).href)};
const plugin=exact(${JSON.stringify(options)});try{const result=await Bun.build({entrypoints:['./entry.tsx'],outdir:'./out-client',target:'browser',format:'esm',naming:'entry.js',plugins:[plugin]});if(!result.success)throw new Error(result.logs.map(x=>x.message).join('\\n'));}finally{await plugin.dispose();}`
		);
		await promisify(execFile)(process.env.BUN_EXECUTABLE ?? 'bun', [script], { cwd: root });
		return;
	}
	const { default: webpack } = await import('webpack');
	const { ExactWebpackPlugin } = await import('../webpack-plugin/dist/index.js');
	const compiler = webpack({
		mode: 'development',
		target: 'web',
		context: root,
		entry: './entry.tsx',
		output: {
			path: path.join(root, 'out-client'),
			filename: 'entry.cjs',
			library: { type: 'commonjs2' }
		},
		resolve: {
			extensions: ['.tsx', '.ts', '.js'],
			extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
		},
		resolveLoader: { modules: [path.resolve('node_modules')] },
		plugins: [new ExactWebpackPlugin(options)],
		infrastructureLogging: { level: 'none' }
	});
	try {
		await new Promise<void>((resolve, reject) =>
			compiler.run((error, stats) =>
				error
					? reject(error)
					: !stats || stats.hasErrors()
						? reject(
								new Error(stats?.toString({ all: false, errors: true }) ?? 'Missing webpack stats')
							)
						: resolve()
			)
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			compiler.close((error) => (error ? reject(error) : resolve()))
		);
	}
}
