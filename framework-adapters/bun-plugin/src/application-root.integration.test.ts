import { it } from 'vitest';
import { verifyApplicationRoot } from '../../test-support/application-root-contract.js';

it.each([false, true])(
	'uses the host root with explicit override %s',
	(explicit) => verifyApplicationRoot('bun', explicit),
	30000
);
