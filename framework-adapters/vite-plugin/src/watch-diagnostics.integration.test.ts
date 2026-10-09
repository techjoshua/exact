import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, createServer, type ViteDevServer } from 'vite';
import { expect, it, vi } from 'vitest';
import { exact } from './index.js';

it.each([true, false])(
	'checks each development watch event once with HMR=%s',
	async (hmr) => {
		const workspace = fileURLToPath(new URL('../../../', import.meta.url));
		const root = await mkdtemp(path.join(workspace, '.tmp/watch-diagnostics-'));
		let server: ViteDevServer | undefined;
		let invalidations = 0;
		let hotUpdates = 0;
		const warnings: string[] = [];
		const logger = createLogger('silent');
		logger.warn = (message) => warnings.push(message);
		const model = path.join(root, 'model.ts');
		try {
			await writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({ compilerOptions: { strict: true }, include: ['*.ts'] })
			);
			await writeFile(model, 'export const value: number = 1;');
			server = await createServer({
				root,
				configFile: false,
				customLogger: logger,
				plugins: [
					exact({
						reactCompatibility: false,
						onProfile(event) {
							if (event.subsystem === 'compiler' && event.phase === 'invalidate') invalidations++;
						}
					}),
					{
						name: 'observe-hot-update-completion',
						handleHotUpdate() {
							hotUpdates++;
						}
					}
				],
				server: { middlewareMode: true, hmr, watch: null },
				appType: 'custom'
			});
			await server.ssrLoadModule('/model.ts');
			async function notify(event: 'change' | 'add' | 'unlink', filename: string): Promise<void> {
				const previous = invalidations;
				const previousHot = hotUpdates;
				server!.watcher.emit(event, filename);
				await vi.waitFor(() => expect(invalidations).toBeGreaterThan(previous));
				if (hmr && event === 'change')
					await vi.waitFor(() => expect(hotUpdates).toBeGreaterThan(previousHot));
				expect(invalidations - previous).toBe(1);
			}
			await writeFile(model, 'export const value: number = "invalid";');
			await notify('change', model);
			expect(warnings.some((message) => message.includes('TS2322'))).toBe(true);
			warnings.length = 0;
			await writeFile(model, 'export const value: number = 2;');
			await notify('change', model);
			expect(warnings).toEqual([]);
			if (hmr)
				await vi.waitFor(async () =>
					expect((await server!.ssrLoadModule('/model.ts')).value).toBe(2)
				);
			const added = path.join(root, 'added.ts');
			await writeFile(added, 'export const added: string = "valid";');
			await notify('add', added);
			await rm(added);
			await notify('unlink', added);
			expect(warnings).toEqual([]);
			if (!hmr) expect(hotUpdates).toBe(0);
		} finally {
			await server?.close();
			await rm(root, { recursive: true, force: true });
		}
	},
	30_000
);
