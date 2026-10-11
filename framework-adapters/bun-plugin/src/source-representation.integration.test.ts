import { it } from 'vitest';
import { verifySourceRepresentationContract } from '../../test-support/source-representation-contract.js';

it(
	'keeps source assets separate from executable components in both targets',
	() => verifySourceRepresentationContract('bun'),
	150000
);
