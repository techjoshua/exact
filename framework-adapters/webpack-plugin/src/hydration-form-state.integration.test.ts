import { it } from 'vitest';
import { verifyHydrationFormStateContract } from '../../test-support/hydration-form-state-contract.js';

it(
	'preserves browser-owned controls through paired hydration and recovery',
	() => verifyHydrationFormStateContract('webpack'),
	60000
);
