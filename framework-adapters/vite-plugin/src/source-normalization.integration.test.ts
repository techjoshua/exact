import { it } from 'vitest';
import { verifySourceNormalizationContract } from '../../test-support/source-normalization-contract.js';

it(
	'preserves scoped setup calculations and cycle diagnostics in both targets',
	() => verifySourceNormalizationContract('vite'),
	60000
);
