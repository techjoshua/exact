import { it } from 'vitest';
import { verifyHydrationHandoffContract } from '../../test-support/hydration-handoff-contract.js';
it(
	'retains packaged server children through enhanced adoption and permitted recovery',
	() => verifyHydrationHandoffContract('bun'),
	90000
);
