import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { createExactBuildConfiguration } from './adapter-configuration.js';

it('shares a generation, ignores unrelated changes, and recovers after a rejected load', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-config-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	const filename = path.join(root, 'custom.mjs');
	await writeFile(filename, 'export default {};');
	const config = createExactBuildConfiguration({ applicationRoot: root, configPath: filename });
	const initial = config.read();
	expect(config.read()).toBe(initial);
	await initial;
	expect(config.invalidate(path.join(root, 'page.tsx'))).toBe(false);
	expect(config.read()).toBe(initial);
	await writeFile(filename, 'throw new Error("broken configuration");');
	expect(config.invalidate(filename)).toBe(true);
	await expect(config.read()).rejects.toThrow('broken configuration');
	await writeFile(filename, 'export default {};');
	await expect(config.read()).resolves.toMatchObject({ configPath: filename });
});

it('redirects an unfinished superseded load to the current generation', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-config-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	const filename = path.join(root, 'exact.config.mjs');
	await writeFile(filename, 'export default {};');
	const config = createExactBuildConfiguration({ applicationRoot: root });
	const stale = config.read();
	config.invalidate();
	const current = config.read();
	expect(stale).not.toBe(current);
	expect(await stale).toBe(await current);
	expect(await config.watchFiles()).toContain(filename);
	await rm(filename);
	expect(config.invalidate(filename)).toBe(true);
	await expect(config.read()).resolves.toMatchObject({ watchFiles: [], packageEnhancements: [] });
	expect(await config.watchFiles()).toContain(filename);
	await writeFile(filename, 'export default {};');
	expect(config.invalidate(filename)).toBe(true);
	await expect(config.read()).resolves.toMatchObject({ configPath: filename });
});

it('watches absent discovery candidates before the first configuration is created', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-config-new-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	const config = createExactBuildConfiguration({ applicationRoot: root });
	await expect(config.read()).resolves.toMatchObject({ watchFiles: [] });
	for (const extension of ['ts', 'mts', 'js', 'mjs', 'cjs'])
		expect(await config.watchFiles()).toContain(path.join(root, `exact.config.${extension}`));
	const filename = path.join(root, 'exact.config.mjs');
	await writeFile(filename, 'export default {};');
	expect(config.invalidate(filename)).toBe(true);
	await expect(config.read()).resolves.toMatchObject({ configPath: filename });
});
