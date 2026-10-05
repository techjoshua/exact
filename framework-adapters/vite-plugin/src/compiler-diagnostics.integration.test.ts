import { verifyEnhancementTemplateContract } from '../../test-support/enhancement-template-contract.js';
import { verifyCompilerAliasPolicies } from '../../test-support/callable-alias-policy.js';
import { it } from 'vitest';
import { verifyCompilerDiagnostics } from '../../test-support/compiler-diagnostics.js';

it(
	'preserves imported-helper diagnostics and their supported correction',
	() => verifyCompilerDiagnostics('vite'),
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
