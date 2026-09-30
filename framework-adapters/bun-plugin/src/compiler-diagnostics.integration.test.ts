type SharedTestApi = Pick<typeof import('vitest'), 'describe' | 'it'>;
const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (
	runningInBun ? await import(bunTestModule) : await import('vitest')
) as SharedTestApi;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('compiler diagnostics', () => {
	testApi.it(
		'preserves imported-helper diagnostics and their supported correction',
		async () => {
			const { verifyCompilerDiagnostics } = await import(
				'../../test-support/compiler-diagnostics.js'
			);
			await verifyCompilerDiagnostics('bun');
		},
		30000
	);
});
