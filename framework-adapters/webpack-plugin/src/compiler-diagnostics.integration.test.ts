import { it } from 'vitest';
import { verifyCompilerDiagnostics } from '../../test-support/compiler-diagnostics.js';

it(
	'preserves imported-helper diagnostics and their supported correction',
	() => verifyCompilerDiagnostics('webpack'),
	30000
);
