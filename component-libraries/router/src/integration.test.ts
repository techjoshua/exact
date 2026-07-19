import { createReactCompatibilityBuildEngine } from '@exact/react-compat/build';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe('router compatibility integration', () => {
	it('selects data and v5 facades from distinct resolved package instances', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-router-variants-'));
		temporaryDirectories.push(root);
		const routerManifest = JSON.parse(
			readFileSync(new URL('../package.json', import.meta.url), 'utf8')
		);
		writeFileSync(
			path.join(root, 'package.json'),
			JSON.stringify({
				name: 'router-variant-app',
				version: '1.0.0',
				dependencies: {
					'@exact/router': '0.0.0',
					'react-router-dom': '7.9.0',
					nested: '1.0.0',
					unsupported: '1.0.0'
				}
			})
		);
		writeFileSync(
			path.join(root, 'package-lock.json'),
			JSON.stringify({
				name: 'router-variant-app',
				version: '1.0.0',
				lockfileVersion: 3,
				packages: {
					'': {
						name: 'router-variant-app',
						version: '1.0.0',
						dependencies: {
							'@exact/router': '0.0.0',
							'react-router-dom': '7.9.0',
							nested: '1.0.0',
							unsupported: '1.0.0'
						}
					},
					'node_modules/@exact/router': routerManifest,
					'node_modules/@exact/react-compat-adapter-api': {
						name: '@exact/react-compat-adapter-api',
						version: '1.0.0'
					},
					'node_modules/react-router-dom': {
						name: 'react-router-dom',
						version: '7.9.0'
					},
					'node_modules/nested': {
						name: 'nested',
						version: '1.0.0',
						dependencies: { 'react-router-dom': '5.3.4' }
					},
					'node_modules/nested/node_modules/react-router-dom': {
						name: 'react-router-dom',
						version: '5.3.4'
					},
					'node_modules/unsupported': {
						name: 'unsupported',
						version: '1.0.0',
						dependencies: { 'react-router-dom': '8.0.0' }
					},
					'node_modules/unsupported/node_modules/react-router-dom': {
						name: 'react-router-dom',
						version: '8.0.0'
					}
				}
			})
		);

		const engine = createReactCompatibilityBuildEngine({ cwd: root, target: 19 });
		const modern = engine.transformModule({
			id: path.join(root, 'src/app.ts'),
			source:
				'import { RouterProvider, useNavigate } from "react-router-dom"; export { RouterProvider, useNavigate };',
			format: 'module',
			target: 'client'
		});
		const legacy = engine.transformModule({
			id: path.join(root, 'node_modules/nested/src/view.ts'),
			source:
				'import { Switch, useHistory } from "react-router-dom"; export { Switch, useHistory };',
			format: 'module',
			target: 'client'
		});
		expect(modern.code).toContain('from "@exact/router/data"');
		expect(legacy.code).toContain('from "@exact/router/v5"');
		expect(engine.report().substitutions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sourceVersion: '>=6.4 <8', targetModule: '@exact/router/data' }),
				expect.objectContaining({ sourceVersion: '>=5 <6', targetModule: '@exact/router/v5' })
			])
		);
		expect(() =>
			engine.transformModule({
				id: path.join(root, 'src/unsupported-export.ts'),
				source: 'import { HydratedRouter } from "react-router-dom"; export { HydratedRouter };',
				format: 'module',
				target: 'client'
			})
		).toThrow(/Unsupported runtime react-router-dom HydratedRouter.*mix compatibility authorities/);
		expect(() =>
			engine.transformModule({
				id: path.join(root, 'node_modules/unsupported/src/view.ts'),
				source: 'import { RouterProvider } from "react-router-dom"; export { RouterProvider };',
				format: 'module',
				target: 'client'
			})
		).toThrow(/react-router-dom@8\.0\.0.*supports >=5 <6, >=6 <6\.4, >=6\.4 <8/);
	});

	it('keeps facade entrypoints side-effect free and out of the native import graph', () => {
		const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
		const native = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
		const data = readFileSync(new URL('./data.ts', import.meta.url), 'utf8');
		const v5 = readFileSync(new URL('./v5.ts', import.meta.url), 'utf8');
		expect(manifest.sideEffects).toBe(false);
		expect(native).not.toContain('@exact/react-compat');
		expect(native).not.toMatch(/from\s+["']\.\/(?:modern|data|v5)\.js["']/);
		expect(data).toContain("from './modern.js'");
		expect(data).not.toContain("from './v5.js'");
		expect(v5).not.toContain("from './data.js'");
	});
});
