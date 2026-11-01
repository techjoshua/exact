import { it } from 'vitest';
import {
	stateNodeMatchesWrites,
	stateOutputPathsMatchWrites,
	stateDeletionPathsMatchWrites
} from './framework/protocol-records.js';
import {
	verifyStateAuthorityLookup,
	verifyStatePathSelections
} from '../../component-composition-corpus/test-support/state-authority-journey.mjs';
it.each([3, 2_000])('matches state authority for %i independent selections', (count) => {
	verifyStateAuthorityLookup({ stateNodeMatchesWrites }, count);
});

it.each([3, 2_000])('retains output and deletion authority for %i selections', (count) => {
	verifyStatePathSelections({ stateOutputPathsMatchWrites, stateDeletionPathsMatchWrites }, count);
});
