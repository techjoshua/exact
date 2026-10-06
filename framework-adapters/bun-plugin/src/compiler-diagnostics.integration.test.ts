import { verifyRenderProgramContract } from '../../test-support/render-program-contract.js';
import { verifyPolicySubsystemContract } from '../../test-support/policy-subsystem-contracts.js';
import { verifyHostImportIdentityContract } from '../../test-support/host-import-identity-contract.js';
import { verifyTaskCapturedInputsContract } from '../../test-support/task-captured-inputs-contract.js';
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

	testApi.it(
		'preserves captured task inputs through both targets',
		() => verifyTaskCapturedInputsContract('bun'),
		60000
	);
	testApi.it(
		'preserves lexical renderer and capability identity through both targets',
		() => verifyHostImportIdentityContract('bun'),
		60000
	);
});

describeBun('policy subsystem contracts', () => {
	for (const contract of ['receipts', 'contexts', 'returns', 'console'] as const) {
		testApi.it(
			`preserves policy subsystem ${contract}`,
			() => verifyPolicySubsystemContract('bun', contract),
			120000
		);
	}
});

if (runningInBun)
	testApi.it(
		'preserves compiled render property order and updates',
		() => verifyRenderProgramContract('bun'),
		60000
	);
