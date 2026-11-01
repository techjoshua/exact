import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { chromium } from 'playwright';
import { NativeCompilerProcess, resolveNativeCompilerExecutable } from '@exactjs/compiler';
import { buildNativeBrowserFixture } from './native-browser-build.js';

it.each(['vite', 'bun', 'webpack'] as const)(
	'retains supplied operation owners in Chromium through %s',
	async (adapter) => {
		const parent = path.resolve('.tmp/retained-operation-adapters');
		await mkdir(parent, { recursive: true });
		const root = await mkdtemp(path.join(parent, adapter + '-'));
		onTestFinished(() => rm(root, { recursive: true, force: true }));
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ name: '@fixture/retained-operation', private: true, type: 'module' })
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
		const fixtures = path.resolve('packages/component-composition-corpus/test-support');
		for (const name of ['retained-operation.fixtures.tsx', 'retained-operation-journey.ts'])
			await writeFile(path.join(root, name), await readFile(path.join(fixtures, name)));
		await writeFile(
			path.join(root, 'entry.tsx'),
			"export {verifyRetainedOperationIdentity as verify} from './retained-operation-journey.js';"
		);
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		try {
			for (const target of ['client', 'server'] as const) {
				const id = path.join(root, 'retained-operation.fixtures.tsx');
				const response = compiler.request({
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
				expect(response.analysis.components.map((component) => component.name).sort()).toEqual([
					'ConditionalSpan',
					'StableButton',
					'SuppliedParent'
				]);
				for (const component of response.analysis.components) {
					expect(component.diagnostics).toEqual([]);
					expect(component.placement).toBe('isomorphic');
					expect(component.artifactTargets).toEqual(['client', 'server']);
				}
			}
		} finally {
			compiler.dispose();
		}
		await buildNativeBrowserFixture(adapter, root);
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
			await page.route('https://retained-operation.test/**', (route) =>
				route.fulfill({
					contentType: route.request().url().endsWith('entry.js') ? 'text/javascript' : 'text/html',
					body: route.request().url().endsWith('entry.js') ? code : '<!doctype html><body></body>'
				})
			);
			await page.goto('https://retained-operation.test/');
			const result =
				adapter === 'webpack'
					? await page.evaluate((source) => {
							const module = { exports: {} };
							new Function('exports', 'module', source)(module.exports, module);
							return (module.exports as { verify: () => unknown }).verify();
						}, code)
					: await page.evaluate(
							"(async()=>{const m=await import('https://retained-operation.test/entry.js');return m.verify();})()"
						);
			expect(result).toEqual({
				retained: true,
				restored: true,
				interaction: true,
				cleanup: true,
				fresh: true,
				reports: []
			});
			expect(errors).toEqual([]);
			expect(await page.locator('body').evaluate((e) => e.childNodes.length)).toBe(0);
		} finally {
			await browser.close();
		}
	},
	120000
);
