import { ExactBunSourcePreparation } from './source-compilation/preparation.js';
import { verifySourcePreparationContract } from '../../test-support/source-preparation-contract.js';
import { verifyAssignmentIdentityContract } from '../../test-support/assignment-identity-contract.js';
import { loadAdapterTestApi } from '../../test-support/adapter-test-api.js';
import { verifyStatePublicationContract } from '../../test-support/state-publication-contract.js';
import { verifyHydrationFormStateContract } from '../../test-support/hydration-form-state-contract.js';
import { verifyCompilerIntlStructureContract } from '../../test-support/compiler-intl-structure-contract.js';
import { verifyCompilerStateAliasContract } from '../../test-support/compiler-state-alias-contract.js';
import { verifyRenderProgramContract } from '../../test-support/render-program-contract.js';
import { verifyPolicySubsystemContract } from '../../test-support/policy-subsystem-contracts.js';
import { verifyHostImportIdentityContract } from '../../test-support/host-import-identity-contract.js';
import { verifyTaskCapturedInputsContract } from '../../test-support/task-captured-inputs-contract.js';
import { verifyEnhancementTemplateContract } from '../../test-support/enhancement-template-contract.js';
import {
	verifyCompilerDiagnostics,
	compilerDiagnosticContracts
} from '../../test-support/compiler-diagnostics.js';
const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const testApi = await loadAdapterTestApi();
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('compiler diagnostics', () => {
	testApi.it(
		'prepares identical source once per target and Intl generation',
		() =>
			verifySourcePreparationContract('bun', ({ filename, intl, options }) => {
				const cache = new ExactBunSourcePreparation();
				return {
					prepare: (source, target) =>
						cache.prepare(source, filename, target, options, intl, () => {}, true),
					clear: () => cache.clear()
				};
			}),
		60000
	);

	testApi.it(
		'preserves performed state publication through both targets',
		() => verifyStatePublicationContract('bun'),
		120000
	);
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
	testApi.it.each(compilerDiagnosticContracts)(
		'preserves diagnostics and supported corrections for %s',
		(contract) => verifyCompilerDiagnostics('bun', contract),
		60000
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

describeBun('compiler state aliases', () => {
	testApi.it(
		'preserves setup state aliases and DOM declaration placement',
		() => verifyCompilerStateAliasContract('bun'),
		60000
	);
});

describeBun('compiler Intl structures', () => {
	testApi.it(
		'preserves strict translated structure callback types',
		() => verifyCompilerIntlStructureContract('bun'),
		60000
	);
});

describeBun('hydration form state', () => {
	testApi.it(
		'preserves browser-owned controls through paired hydration and recovery',
		() => verifyHydrationFormStateContract('bun'),
		60000
	);
});

describeBun('authored assignment identity', () => {
	testApi.it(
		'preserves authored assignment through mount and paired hydration',
		() => verifyAssignmentIdentityContract('bun'),
		120000
	);
});
