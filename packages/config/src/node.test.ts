import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { checkConfigReload, checkStaticEnhancements } from '../test-support/reload.mjs';
import { findExactConfig, loadExactConfig, loadExactPackageEnhancements } from './node.js';

describe('@exactjs/config/node', () => {
	it('retains the synchronous declaration API across native preparation', async () => {
		await checkStaticEnhancements(loadExactPackageEnhancements);
	});
	it.each(['ts', 'mts'])('loads typed %s configs through native preparation', async (extension) => {
		await checkConfigReload(loadExactConfig, extension);
	});
	it.skipIf(process.platform === 'win32' || process.getuid?.() === 0).each(['mjs', 'js'])(
		'loads and reloads %s in a genuinely read-only directory',
		async (extension) => {
			await checkConfigReload(loadExactConfig, extension, true);
		}
	);
	it.each(['mjs', 'js'])('reloads %s policy with authored module metadata', async (extension) => {
		await checkConfigReload(loadExactConfig, extension);
	});
	it.each(['ts', 'mjs'])(
		'returns ordinary %s loader metadata and callback values',
		async (extension) => {
			const root = mkdtempSync(path.join(tmpdir(), 'exact-config-aliases-'));
			onTestFinished(() => rmSync(root, { recursive: true, force: true }));
			writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
			writeFileSync(
				path.join(root, `exact.config.${extension}`),
				`
export * as theme from '@fixture/theme' with { type: 'exact-enhancement', scope: 'package' };
const transform = Object.assign(() => {transform.calls++;}, {calls: 0});
export default {debug: {runtime: true}, plugins: {example: transform}};`
			);
			const loaded = await loadExactConfig({ applicationRoot: root });
			const watches: { length: number } = loaded.watchFiles;
			watches.length = 0;
			expect(loaded.watchFiles).toHaveLength(0);
			if (!loaded.config?.debug) throw new Error('Missing owned configuration');
			const debug: { runtime?: boolean | 'auto' } = loaded.config.debug;
			debug.runtime = false;
			const callback = Object.values(loaded.config.plugins ?? {})[0];
			if (typeof callback !== 'function') throw new Error('Missing plugin callback');
			Reflect.apply(callback, undefined, []);
			expect(Reflect.get(callback, 'calls')).toBe(1);
			const entry: { localName: string } = loaded.packageEnhancements[0]!;
			entry.localName = 'snapshot alias';
			const next = await loadExactConfig({ applicationRoot: root });
			expect(next.packageEnhancements[0]?.localName).toBe('theme');
		}
	);

	it.each(['ts', 'mjs'])(
		'owns distinct temporary modules for concurrent %s loads',
		async (extension) => {
			const root = mkdtempSync(path.join(tmpdir(), 'exact-config-concurrent-'));
			onTestFinished(() => rmSync(root, { recursive: true, force: true }));
			writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
			writeFileSync(path.join(root, 'settings.mjs'), 'export default { debug: {} };');
			writeFileSync(
				path.join(root, `exact.config.${extension}`),
				`
export * as theme from '@fixture/theme' with { type: 'exact-enhancement', scope: 'package' };
export { default } from './settings.mjs';`
			);
			const clock = vi.spyOn(Date, 'now').mockReturnValue(1234);
			onTestFinished(() => clock.mockRestore());
			// Every caller must finish before cleanup, including callers racing a rejected load.
			const results = await Promise.allSettled(
				Array.from({ length: 8 }, () => loadExactConfig({ applicationRoot: root }))
			);
			for (const result of results) {
				expect(result.status).toBe('fulfilled');
				if (result.status === 'fulfilled') expect(result.value.config?.debug).toEqual({});
			}
			expect(readdirSync(root).filter((file) => file.startsWith('.exact-config-'))).toEqual([]);
		}
	);

	it('discovers config under a dot-prefixed child while rejecting a neighboring workspace', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-config-dot-prefix-'));
		onTestFinished(() => rmSync(root, { recursive: true, force: true }));
		const workspace = path.join(root, 'workspace');
		const application = path.join(workspace, '..application');
		const sibling = path.join(root, 'workspace-other');
		mkdirSync(application, { recursive: true });
		mkdirSync(sibling, { recursive: true });
		writeFileSync(path.join(workspace, 'exact.config.mjs'), 'export default {};');
		writeFileSync(path.join(sibling, 'exact.config.mjs'), 'export default {};');
		expect(findExactConfig(application, workspace)).toBe(path.join(workspace, 'exact.config.mjs'));
		expect(findExactConfig(sibling, workspace)).toBeUndefined();
		expect(findExactConfig(root, workspace)).toBeUndefined();
	});

	it('finds the nearest nested project config without escaping its workspace boundary', () => {
		const outer = mkdtempSync(path.join(tmpdir(), 'exact-config-boundary-'));
		const workspace = path.join(outer, 'workspace');
		const application = path.join(workspace, 'apps', 'example');
		const source = path.join(application, 'src');
		mkdirSync(source, { recursive: true });
		writeFileSync(path.join(outer, 'exact.config.ts'), 'export default {};\n');
		writeFileSync(path.join(application, 'exact.config.ts'), 'export default {};\n');

		expect(findExactConfig(source, workspace)).toBe(path.join(application, 'exact.config.ts'));
		expect(findExactConfig(workspace, workspace)).toBeUndefined();
	});

	it('uses deterministic discovery order and reports the config watch file', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-config-discovery-'));
		const nested = path.join(root, 'src', 'nested');
		mkdirSync(nested, { recursive: true });
		writeFileSync(path.join(root, 'exact.config.mjs'), 'export default { debug: {} };\n');
		writeFileSync(
			path.join(root, 'exact.config.ts'),
			"export default { componentLibraries: { mode: 'root' } };\n"
		);

		const loaded = await loadExactConfig({ applicationRoot: nested });

		expect(loaded.configPath).toBe(path.join(root, 'exact.config.ts'));
		expect(loaded.watchFiles).toEqual([path.join(root, 'exact.config.ts')]);
		expect(loaded.config?.componentLibraries?.mode).toBe('root');
		expect(readdirSync(root).filter((file) => file.startsWith('.exact-config-'))).toEqual([]);
	});

	it('gives an explicit relative path precedence over discovery', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-config-explicit-'));
		writeFileSync(path.join(root, 'exact.config.mjs'), 'export default { debug: {} };\n');
		writeFileSync(
			path.join(root, 'custom.mjs'),
			"export default { componentLibraries: { mode: 'all' } };\n"
		);

		const loaded = await loadExactConfig({
			applicationRoot: root,
			configPath: 'custom.mjs'
		});

		expect(loaded.configPath).toBe(path.join(root, 'custom.mjs'));
		expect(loaded.config?.componentLibraries?.mode).toBe('all');
	});

	it('removes a TypeScript temporary module when validation fails', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-config-invalid-'));
		writeFileSync(path.join(root, 'exact.config.ts'), 'export default null;\n');

		await expect(loadExactConfig({ applicationRoot: root })).rejects.toThrow(
			'must default-export an eXact configuration object'
		);
		expect(readdirSync(root).filter((file) => file.startsWith('.exact-config-'))).toEqual([]);
	});

	it('normalizes JavaScript configuration through the same schema boundary', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-config-schema-'));
		writeFileSync(
			path.join(root, 'exact.config.mjs'),
			"export default { componentLibraries: { mode: 'trusted', typo: true } };\n"
		);

		await expect(loadExactConfig({ applicationRoot: root })).rejects.toThrow(
			'componentLibraries contains unknown option "typo"'
		);
	});

	it('extracts package-scoped enhancements without executing their modules', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-config-enhancements-'));
		writeFileSync(
			path.join(root, 'exact.config.ts'),
			`export * as intl from '@fixture/intl/enhancements' with { type: 'exact-enhancement', scope: 'package' };
export default { debug: {} };\n`
		);

		const loaded = await loadExactConfig({ applicationRoot: root });

		expect(loaded.packageEnhancements).toEqual([
			{
				localName: 'intl',
				moduleSpecifier: '@fixture/intl/enhancements',
				importKind: 'namespace',
				declaredIn: path.join(root, 'exact.config.ts')
			}
		]);
		expect(loaded.config?.debug).toEqual({});
		expect(loadExactPackageEnhancements({ applicationRoot: root })).toEqual({
			configPath: path.join(root, 'exact.config.ts'),
			packageEnhancements: loaded.packageEnhancements
		});
		expect(readdirSync(root).filter((file) => file.startsWith('.exact-config-'))).toEqual([]);
	});

	it('rejects package-scoped imports that imply file-local consumption', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-config-enhancement-import-'));
		writeFileSync(
			path.join(root, 'exact.config.ts'),
			`import * as intl from '@fixture/intl/enhancements' with { type: 'exact-enhancement', scope: 'package' };
export default {};\n`
		);

		await expect(loadExactConfig({ applicationRoot: root })).rejects.toThrow(
			'must use an attributed namespace export'
		);
	});
});
