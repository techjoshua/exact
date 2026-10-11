import { it } from 'vitest';
import { verifyIntlProjectionContract } from '../../test-support/intl-projection-contract.js';

it(
	'retains extracted native Intl semantics in both targets',
	() => verifyIntlProjectionContract('vite'),
	60000
);
