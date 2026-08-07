import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadExactConfig } from './node.js';

describe('@exactjs/config/node', () => {
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
});
