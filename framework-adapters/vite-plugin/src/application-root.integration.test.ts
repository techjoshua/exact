import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { writeApplicationRootFixture } from '../../test-support/application-root-fixture.js';
import { exact } from './index.js';

it.each([false, true])(
	'uses the Vite root with explicit override %s',
	async (explicit) => {
		const temporary = path.resolve('.tmp/vite-application-root');
		await mkdir(temporary, { recursive: true });
		const root = await mkdtemp(path.join(temporary, 'app-'));
		onTestFinished(() => rm(root, { recursive: true, force: true }));
		await writeApplicationRootFixture(root);
		const server = await createServer({
			root,
			configFile: false,
			appType: 'custom',
			logLevel: 'silent',
			plugins: [
				exact({
					target: 'server',
					serverComponents: true,
					reactCompatibility: false,
					...(explicit ? { applicationRoot: root } : {})
				})
			],
			server: { middlewareMode: true }
		});
		try {
			const loaded = await server.ssrLoadModule(
				explicit ? path.join(root, 'entry.tsx') : '/entry.tsx'
			);
			expect(await loaded.run()).toContain('data-root="owned"');
		} finally {
			await server.close();
		}
	},
	30_000
);
