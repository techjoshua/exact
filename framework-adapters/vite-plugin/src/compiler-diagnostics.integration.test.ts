import { verifyRenderProgramContract } from '../../test-support/render-program-contract.js';
import { verifyPolicySubsystemContract } from '../../test-support/policy-subsystem-contracts.js';
import { verifyHostImportIdentityContract } from '../../test-support/host-import-identity-contract.js';
import { verifyTaskCapturedInputsContract } from '../../test-support/task-captured-inputs-contract.js';
import { verifyEnhancementTemplateContract } from '../../test-support/enhancement-template-contract.js';
import { verifyCompilerAliasPolicies } from '../../test-support/callable-alias-policy.js';
import { it } from 'vitest';
import {
	verifyCompilerDiagnostics,
	compilerDiagnosticContracts
} from '../../test-support/compiler-diagnostics.js';

it.each(compilerDiagnosticContracts)(
	'preserves diagnostics and supported corrections for %s',
	(contract) => verifyCompilerDiagnostics('vite', contract),
	60000
);

it.each(['chain', 'table'] as const)(
	'preserves helper alias return policy (%s)',
	(selection) => verifyCompilerAliasPolicies('vite', selection),
	60000
);

it(
	'preserves enhancement template prop types through both targets',
	() => verifyEnhancementTemplateContract('vite'),
	60000
);

it(
	'preserves captured task inputs through both targets',
	() => verifyTaskCapturedInputsContract('vite'),
	60000
);

it(
	'preserves lexical renderer and capability identity through both targets',
	() => verifyHostImportIdentityContract('vite'),
	60000
);

it.each(['receipts', 'contexts', 'returns', 'console'] as const)(
	'preserves policy subsystem %s',
	(contract) => verifyPolicySubsystemContract('vite', contract),
	60000
);

it(
	'preserves compiled render property order and updates',
	() => verifyRenderProgramContract('vite'),
	60000
);
