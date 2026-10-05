import { verifyTaskCapturedInputsContract } from '../../test-support/task-captured-inputs-contract.js';
import { verifyEnhancementTemplateContract } from '../../test-support/enhancement-template-contract.js';
import { verifyCompilerAliasPolicies } from '../../test-support/callable-alias-policy.js';
import { it } from 'vitest';
import { verifyCompilerDiagnostics } from '../../test-support/compiler-diagnostics.js';

it(
	'preserves imported-helper diagnostics and their supported correction',
	() => verifyCompilerDiagnostics('webpack'),
	60000
);

it.each(['chain', 'table'] as const)(
	'preserves helper alias return policy (%s)',
	(selection) => verifyCompilerAliasPolicies('webpack', selection),
	60000
);

it(
	'preserves enhancement template prop types through both targets',
	() => verifyEnhancementTemplateContract('webpack'),
	60000
);

it(
	'preserves captured task inputs through both targets',
	() => verifyTaskCapturedInputsContract('webpack'),
	60000
);
