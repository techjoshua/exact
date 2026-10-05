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
