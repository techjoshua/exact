import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build, type Plugin } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';

const execute = promisify(execFile);
const repository = fileURLToPath(new URL('../../..', import.meta.url));

it('mounts and hydrates native Intl package children without ambient task integration', async () => {
	const temporary = path.join(repository, '.tmp');
	await mkdir(temporary, { recursive: true });
	const root = await mkdtemp(path.join(temporary, 'native-package-capabilities-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await cp(path.join(repository, 'scripts/performance-fixtures/enhancement-comparison'), root, {
		recursive: true
	});
	await writeFile(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: 'native-package-capabilities-fixture',
			version: '0.0.0',
			private: true,
			type: 'module'
		})
	);
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({ extends: '../../tsconfig.base.json', include: ['*.ts', '*.tsx'] })
	);
	for (const target of ['client', 'server'] as const) {
		const entry = path.join(root, `${target}.tsx`);
		await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [
				exact({
					applicationRoot: root,
					target,
					renderMode: target === 'server' ? 'server-render' : 'client'
				}) as unknown as Plugin
			],
			build: {
				...(target === 'server' ? { ssr: entry } : {}),
				outDir: path.join(root, 'dist'),
				emptyOutDir: false,
				minify: false,
				rollupOptions: {
					input: entry,
					preserveEntrySignatures: 'strict',
					output: { entryFileNames: `${target}.mjs` }
				}
			}
		});
	}
	// A fresh process prevents other tests' task or compatibility registrations from hiding a
	// mismatch between the constructor's declared capabilities and the emitted native child path.
	const runner = path.join(root, 'exercise.mjs');
	await writeFile(
		runner,
		`
import assert from 'node:assert/strict';
import { installPerformanceDom } from ${JSON.stringify(pathToFileURL(path.join(repository, 'scripts/performance/dom-environment.mjs')).href)};
const dom = installPerformanceDom();
try {
 const client = await import('./dist/client.mjs');
 const server = await import('./dist/server.mjs');
 const mounted = client.measureClient('intl', 3, 2);
 assert.equal(mounted.hosts, 0);
 const output = await server.hydrationOutput('intl', 3);
 const hydrated = client.measureHydration('intl', 3, output);
 assert.equal(hydrated.replacedElements, 0);
 assert.equal(hydrated.hydrationOwners, 3);
 console.log('native Intl mount, update, SSR, hydration, and disposal passed');
} finally { dom.window.close(); }
`
	);
	const result = await execute(process.execPath, [runner], { windowsHide: true });
	expect(result.stdout).toContain('native Intl mount, update, SSR, hydration, and disposal passed');
}, 30_000);
