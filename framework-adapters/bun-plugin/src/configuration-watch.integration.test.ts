import path from 'node:path';
import {
	createConfigurationWatchFixture,
	readConfigurationBundle
} from '../../test-support/configuration-watch.js';

const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (runningInBun ? await import(bunTestModule) : await import('vitest')) as Pick<
	typeof import('vitest'),
	'describe' | 'it' | 'expect'
>;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('configuration rebuilds', () => {
	testApi.it(
		'refreshes package enhancement configuration across Bun builds',
		async () => {
			const fixture = await createConfigurationWatchFixture();
			const { exact: builtExact } = await import('../dist/index.js');
			const plugin = builtExact({
				target: 'server',
				applicationRoot: fixture.root,
				serverComponents: true,
				reactCompatibility: false
			});
			try {
				for (const enabled of [true, false, true]) {
					await fixture.configure(enabled);
					const bun = globalThis as unknown as {
						Bun: {
							build(
								options: Record<string, unknown>
							): Promise<{ success: boolean; logs: unknown[] }>;
						};
					};
					const result = await bun.Bun.build({
						entrypoints: [path.join(fixture.root, 'run.ts')],
						outdir: path.join(fixture.root, 'out'),
						naming: 'server.mjs',
						target: 'bun',
						format: 'esm',
						plugins: [plugin]
					});
					testApi.expect(result.success, JSON.stringify(result.logs)).toBe(true);
					testApi
						.expect(await readConfigurationBundle(path.join(fixture.root, 'out/server.mjs')))
						.toBe(enabled);
				}
			} finally {
				await plugin.dispose();
				await fixture.dispose();
			}
		},
		30000
	);
});
