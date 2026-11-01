import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { chromium } from 'playwright';
import { NativeCompilerProcess, resolveNativeCompilerExecutable } from '@exactjs/compiler';
import { buildNativeBrowserFixture as buildBrowser } from './native-browser-build.js';

it.each(['vite', 'bun', 'webpack'] as const)(
	'preserves compiled form submit lifetime in Chromium via %s',
	async (adapter) => {
		const parent = path.resolve('.tmp/form-submit-lifetime');
		await mkdir(parent, { recursive: true });
		const root = await mkdtemp(path.join(parent, adapter + '-'));
		onTestFinished(() => rm(root, { recursive: true, force: true }));
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ name: '@fixture/form-submit-lifetime', private: true, type: 'module' })
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
		const fixture = path.resolve('packages/component-composition-corpus/test-support/forms');
		await mkdir(path.join(root, 'form'));
		for (const name of ['form.tsx', 'field.ts', 'context.ts', 'contracts.ts', 'values.ts'])
			await writeFile(
				path.join(root, 'form', name),
				await readFile(path.resolve('component-libraries/forms/src/form', name))
			);
		await writeFile(
			path.join(root, 'submit-lifetime.fixtures.tsx'),
			(await readFile(path.join(fixture, 'submit-lifetime.fixtures.tsx'), 'utf8')).replaceAll(
				'../../../../component-libraries/forms/src/form/',
				'./form/'
			)
		);
		await writeFile(
			path.join(root, 'submit-lifetime-journey.ts'),
			await readFile(path.join(fixture, 'submit-lifetime-journey.ts'), 'utf8')
		);
		await writeFile(
			path.join(root, 'entry.ts'),
			"export {verifySubmitLifetime as verify} from './submit-lifetime-journey.js';"
		);
		const native = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		try {
			for (const target of ['client', 'server'] as const) {
				const id = path.join(root, 'submit-lifetime.fixtures.tsx');
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
			"export {verifySubmitLifetime as verify} from './submit-lifetime-journey.js';"
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
			await page.route('https://form-submit-lifetime.test/**', (route) =>
				route.fulfill({
					contentType: route.request().url().endsWith('entry.js') ? 'text/javascript' : 'text/html',
					body: route.request().url().endsWith('entry.js') ? code : '<!doctype html><body></body>'
				})
			);
			await page.goto('https://form-submit-lifetime.test/');
			const result =
				adapter === 'webpack'
					? await page.evaluate((source) => {
							const module = { exports: {} };
							new Function('exports', 'module', source)(module.exports, module);
							return (module.exports as { verify: () => unknown }).verify();
						}, code)
					: await page.evaluate(
							"(async()=>{const m=await import('https://form-submit-lifetime.test/entry.js');return m.verify();})()"
						);
			expect(result).toEqual({
				disposedValidation: true,
				disposedRaw: true,
				alreadyStarted: true,
				cancelled: true,
				progress: true,
				refsReleased: true,
				detachedHandlerInactive: true,
				expectedRejections: 1,
				unexpectedReports: []
			});
			expect(errors).toEqual([]);
			expect(await page.locator('body').evaluate((el) => el.childNodes.length)).toBe(0);
		} finally {
			await browser.close();
		}
	},
	120000
);
