import assert from 'node:assert/strict';
import { chmod, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Shared Node/Bun regression for fresh config evaluation and authored module metadata. */
export async function checkConfigReload(loadExactConfig, extension = 'mjs', readOnly = false) {
	const root = await realpath(await mkdtemp(path.join(tmpdir(), 'exact-config-reload-')));
	const configPath = path.join(root, `exact.config.${extension}`);
	const sibling = path.join(root, 'sibling.mjs');
	// Exercise .cts via explicit configPath without changing discovery.
	const options =
		extension === 'cts' ? { applicationRoot: root, configPath } : { applicationRoot: root };
	const typed = ['ts', 'mts', 'cts'].includes(extension);
	try {
		await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
		await writeFile(sibling, 'export const value = 3; export const identity = {};');
		let dependencyIdentity;
		let firstInspect;
		for (const threshold of [false, undefined, 1, false]) {
			const analysis =
				threshold === undefined
					? '{}'
					: JSON.stringify({ analysis: { estimatedCostWarningThreshold: threshold } });
			await writeFile(
				configPath,
				`import {value, identity} from './sibling.mjs';
await Promise.resolve();
const observed${typed ? ': number' : ''} = value;
const inspect = () => ({value: observed, identity, url: import.meta.url, filename: import.meta.filename,
 dirname: import.meta.dirname, resolved: import.meta.resolve('./sibling.mjs')});
export default {...${analysis}, plugins: {inspect}};`
			);
			if (readOnly) {
				await chmod(root, 0o555);
				await assert.rejects(writeFile(path.join(root, 'must-not-create'), 'denied'), {
					code: 'EACCES'
				});
			}
			const loaded = await loadExactConfig(options);
			assert.equal(loaded.config?.analysis?.estimatedCostWarningThreshold, threshold);
			assert.deepEqual(loaded.watchFiles, [configPath]);
			const inspect = loaded.config.plugins.inspect;
			assert.equal(typeof inspect, 'function');
			firstInspect ??= inspect;
			const metadata = inspect();
			dependencyIdentity ??= metadata.identity;
			assert.equal(metadata.identity, dependencyIdentity, 'only the config module is invalidated');
			// Node retains its native query URL. Both runtimes retain the authored module base.
			const moduleUrl = new URL(metadata.url);
			moduleUrl.search = '';
			assert.deepEqual(
				{ ...metadata, url: moduleUrl.href },
				{
					value: 3,
					identity: dependencyIdentity,
					url: pathToFileURL(configPath).href,
					filename: configPath,
					dirname: root,
					resolved: pathToFileURL(sibling).href
				}
			);
			assert.deepEqual(
				(await readdir(root)).filter((name) => name.startsWith('.exact-config-')),
				[]
			);
		}
		assert.equal(
			firstInspect().identity,
			dependencyIdentity,
			'retained callbacks remain callable after reload'
		);
		// Concurrent native imports can overlap a top-level await during targeted eviction.
		const concurrent = await Promise.allSettled(
			Array.from({ length: 4 }, () => loadExactConfig(options))
		);
		for (const result of concurrent) {
			assert.equal(result.status, 'fulfilled');
			if (result.status === 'fulfilled') {
				assert.equal(result.value.config.analysis.estimatedCostWarningThreshold, false);
				assert.equal(result.value.config.plugins.inspect().identity, dependencyIdentity);
			}
		}
		for (const [source, message] of [
			['throw new Error("config evaluation failed");', /config evaluation failed/],
			['export default null;', /must default-export/],
			[
				'export default {analysis: {estimatedCostWarningThreshold: 0}};',
				/estimatedCostWarningThreshold/
			]
		]) {
			await writeFile(configPath, source);
			await assert.rejects(loadExactConfig(options), message);
			assert.deepEqual(
				(await readdir(root)).filter((name) => name.startsWith('.exact-config-')),
				[]
			);
		}
	} finally {
		await chmod(root, 0o755);
		await rm(root, { recursive: true, force: true });
	}
}

/** Exercises the public synchronous declaration contract without evaluating config code. */
export async function checkStaticEnhancements(loadExactPackageEnhancements) {
	const root = await realpath(await mkdtemp(path.join(tmpdir(), 'exact-static-config-')));
	try {
		for (const extension of ['ts', 'mts', 'cts', 'mjs']) {
			const configPath = path.join(root, `exact.config.${extension}`);
			const declaration = `// 🧭 café\r\nexport * as theme from './theme.mjs' with {type:'exact-enhancement',scope:'package'};\r\nthrow new Error('config must not execute');`;
			await writeFile(configPath, declaration);
			for (let repeat = 0; repeat < 2; repeat++) {
				const result = loadExactPackageEnhancements({ applicationRoot: root, configPath });
				assert.equal(typeof result.then, 'undefined', 'public API remains synchronous');
				assert.deepEqual(result.packageEnhancements, [
					{
						localName: 'theme',
						moduleSpecifier: './theme.mjs',
						importKind: 'namespace',
						declaredIn: configPath
					}
				]);
			}
			await writeFile(configPath, 'export default {broken: ;');
			assert.throws(
				() => loadExactPackageEnhancements({ applicationRoot: root, configPath }),
				/Unable to parse/
			);
			await writeFile(configPath, declaration);
			assert.equal(
				loadExactPackageEnhancements({ applicationRoot: root, configPath }).packageEnhancements
					.length,
				1
			);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
