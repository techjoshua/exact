import { it } from 'vitest';
import * as api from './core.js';
import {
	verifyNavigationAbortOwnership,
	verifyRevalidationAbortOwnership
} from '../../../packages/component-composition-corpus/test-support/router-operation-ownership-journey.js';

it('retains newer navigation started from an old abort callback', () =>
	verifyNavigationAbortOwnership(api));
it('retains newer revalidation started from an old abort callback', () =>
	verifyRevalidationAbortOwnership(api));
