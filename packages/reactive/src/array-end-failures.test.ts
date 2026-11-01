import { it } from 'vitest';
import * as api from './index.js';
import {
	arrayEndMutationCases,
	verifyArrayEndMutations
} from '../../component-composition-corpus/test-support/array-end-mutation-journey.js';

it.each(arrayEndMutationCases)('preserves native completion and observes %s', (scenario) => {
	verifyArrayEndMutations(api, [scenario]);
});
