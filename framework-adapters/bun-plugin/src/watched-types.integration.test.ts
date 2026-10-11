import path from 'node:path';
import {
	createWatchedTypeFixture,
	readWatchedTypeBundle
} from '../../test-support/watched-type-fixture.js';

const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (runningInBun ? await import(bunTestModule) : await import('vitest')) as Pick<
	typeof import('vitest'),
	'describe' | 'it' | 'expect'
>;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('retained build dependency types', () => {
	testApi.it(
		'uses current declarations on repeated builds with one plugin',
		async () => {
			const fixture = await createWatchedTypeFixture();
			const { exact } = await import('../dist/index.js');
			const plugin = exact({
				target: 'server',
				applicationRoot: fixture.root,
				serverComponents: true,
				reactCompatibility: false
			});
			try {
				for (const array of [false, true, false]) {
					await fixture.update(array);
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
						.expect(await readWatchedTypeBundle(path.join(fixture.root, 'out/server.mjs'), array))
						.toBe(array ? '<p>onetwo</p>' : '<p>initial</p>');
				}
			} finally {
				await plugin.dispose();
				await fixture.dispose();
			}
		},
		30000
	);
});
