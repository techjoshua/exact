import path from 'node:path';

/** Registers native Bun compiler-closed SSR acceptance alongside the adapter's owned test lifecycle. */
export function registerCompilerClosedSsrIntegration(
	describeBun: (name: string, factory: () => void) => unknown,
	testApi: Pick<typeof import('vitest'), 'it' | 'expect'>
): void {
	describeBun('compiler-closed SSR', () => {
		testApi.it(
			'keeps scheduled SSR free of client reactive machinery',
			async () => {
				const { createCompilerClosedSsrFixture, verifyCompilerClosedSsr, compilerClosedSsrResult } =
					await import('./compiler-closed-ssr.js');
				const fixture = await createCompilerClosedSsrFixture();
				let plugin:
					| Awaited<ReturnType<(typeof import('../bun-plugin/dist/index.js'))['exact']>>
					| undefined;
				try {
					const { exact: builtExact } = await import('../bun-plugin/dist/index.js');
					plugin = builtExact({
						target: 'server',
						applicationRoot: fixture.root,
						serverComponents: true,
						reactCompatibility: false
					});
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
					testApi
						.expect(await verifyCompilerClosedSsr(path.join(fixture.root, 'bundle/run.js')))
						.toEqual(compilerClosedSsrResult);
				} finally {
					try {
						await plugin?.dispose();
					} finally {
						await fixture.dispose();
					}
				}
			},
			30000
		);
	});
}
