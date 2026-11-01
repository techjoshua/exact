import { expect, it } from 'vitest';
import * as api from './index.js';
import {
	collectionClearCases,
	verifyCollectionClear,
	hashRollbackCases,
	verifyHashRollback,
	hashOwnerKinds,
	verifyHashOwner
} from '../../component-composition-corpus/test-support/collection-hash-journey.mjs';
for (const kind of ['Map', 'Set'])
	it.each(collectionClearCases)(
		'restores independent ' + kind + ' clear ownership through %s',
		(mode) => {
			expect(verifyCollectionClear(api, kind, mode)).toBe(true);
		}
	);
it.each(hashRollbackCases)('publishes hashes for settled values through %s', (mode) => {
	expect(verifyHashRollback(api, mode)).toBe(true);
});
for (const kind of hashOwnerKinds)
	it.each(['set', 'define', 'delete', 'equal', 'refused', 'rollback'])(
		'invalidates ' + kind + ' hash owners through %s',
		(operation) => {
			expect(verifyHashOwner(api, kind, operation)).toBe(true);
		}
	);
