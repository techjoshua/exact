import { it } from 'vitest';
import { handleExactRequest, defineExactOperationContract } from './index.js';
import { mergeStateForContract } from '../../hydrate/src/state.js';
import {
	stateAuthorityCases,
	verifyStateAuthority
} from '../../component-composition-corpus/test-support/state-authority-journey.mjs';
it.each(stateAuthorityCases)('uses selected path data: %s', async (scenario) => {
	await verifyStateAuthority(
		{ handleExactRequest, defineExactOperationContract, mergeStateForContract },
		scenario
	);
});
