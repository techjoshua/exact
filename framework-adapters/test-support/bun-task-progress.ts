import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** Registers native Bun progress acceptance alongside the adapter's owned test lifecycle. */
export function registerTaskProgressIntegration(
	describeBun: (name: string, factory: () => void) => unknown,
	testApi: Pick<typeof import('vitest'), 'it' | 'expect'>
): void {
	describeBun('task progress transport', () => {
		testApi.it(
			'delivers compiled snapshots through Bun HTTP before task completion',
			async () => {
				const { createTaskProgressFixture } = await import('./task-progress.js');
				const fixture = await createTaskProgressFixture('bun');
				const { exact: builtExact } = await import('../bun-plugin/dist/index.js');
				const plugin = builtExact({
					target: 'server',
					applicationRoot: fixture.root,
					serverComponents: true,
					reactCompatibility: false
				});
				try {
					const bun = (
						globalThis as unknown as {
							Bun: {
								build(
									options: Record<string, unknown>
								): Promise<{ success: boolean; logs: unknown[] }>;
							};
						}
					).Bun;
					const built = await bun.build({
						entrypoints: [path.join(fixture.root, 'run.ts')],
						target: 'bun',
						format: 'esm',
						outdir: path.join(fixture.root, 'bundle'),
						plugins: [plugin]
					});
					testApi.expect(built.success, JSON.stringify(built.logs)).toBe(true);
					const execution = spawnSync(
						process.execPath,
						[path.join(fixture.root, 'bundle/run.js')],
						{
							encoding: 'utf8',
							timeout: 10000
						}
					);
					testApi.expect(execution.status, execution.stderr).toBe(0);
					testApi.expect(JSON.parse(execution.stdout)).toEqual({ progress: true, completed: true });
				} finally {
					await plugin.dispose();
					await fixture.dispose();
				}
			},
			30000
		);
	});
}
