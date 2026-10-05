import { verifyEnhancementTemplateContract } from '../../test-support/enhancement-template-contract.js';
type SharedTestApi = Pick<typeof import('vitest'), 'describe' | 'it'>;
const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (
	runningInBun ? await import(bunTestModule) : await import('vitest')
) as SharedTestApi;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('compiler diagnostics', () => {
	for (const selection of ['chain', 'table'] as const)
		testApi.it(
			`preserves helper alias return policy (${selection})`,
			async () => {
				const { verifyCompilerAliasPolicies } = await import(
					'../../test-support/callable-alias-policy.js'
				);
				await verifyCompilerAliasPolicies('bun', selection);
			},
			60000
		);
	testApi.it(
		'preserves imported-helper diagnostics and their supported correction',
		async () => {
			const { verifyCompilerDiagnostics } = await import(
				'../../test-support/compiler-diagnostics.js'
			);
			await verifyCompilerDiagnostics('bun');
		},
		120000
	);
	testApi.it(
		'preserves enhancement template prop types through both targets',
		() => verifyEnhancementTemplateContract('bun'),
		60000
	);
});
