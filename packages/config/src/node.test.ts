import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findExactConfig, loadExactConfig, loadExactPackageEnhancements } from './node.js';

describe('@exactjs/config/node', () => {
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
