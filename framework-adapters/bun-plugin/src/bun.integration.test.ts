import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exact } from './plugin.js';

type SharedTestApi = Pick<typeof import('vitest'), 'describe' | 'it' | 'expect'>;

const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (
	runningInBun ? await import(bunTestModule) : await import('vitest')
) as SharedTestApi;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('@exactjs/bun-plugin with Bun.build', () => {
	testApi.it('builds eXact TSX while leaving ordinary TypeScript to Bun', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'exact-bun-plugin-'));
		try {
			await writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/exact-bun-build', private: true, type: 'module' })
			);
			await writeFile(
				path.join(root, 'model.ts'),
				'export const model: { count: number } = { count: 1 }; export const small = model.count < 2;'
			);
			const entry = path.join(root, 'entry.tsx');
			await writeFile(
				entry,
				'import { model, small } from "./model.ts"; export { small }; export const view = <button>{model.count}</button>;'
			);

			const bun = (
				globalThis as unknown as {
					Bun: {
						build(options: Record<string, unknown>): Promise<{
							success: boolean;
							logs: unknown[];
							outputs: Array<{ kind: string; text(): Promise<string> }>;
						}>;
					};
				}
			).Bun;
			const result = await bun.build({
				entrypoints: [entry],
				target: 'browser',
				format: 'esm',
				splitting: true,
				sourcemap: 'external',
				external: ['@exactjs/core'],
				plugins: [exact({ applicationRoot: root })]
			});

			testApi.expect(result.success).toBe(true);
			testApi.expect(result.logs).toEqual([]);
			const output = result.outputs.find((item) => item.kind === 'entry-point');
			testApi.expect(output).toBeDefined();
			testApi.expect(await output!.text()).toContain('__exactVNode("button"');
			const sourceMap = result.outputs.find((item) => item.kind === 'sourcemap');
			testApi.expect(await sourceMap!.text()).toContain('entry.tsx');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
