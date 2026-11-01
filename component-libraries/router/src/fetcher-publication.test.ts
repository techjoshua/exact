import { it } from 'vitest';
import * as api from './core.js';
import {
	verifyFetcherPublication,
	verifyFetcherAbortReplacement,
	verifyFetcherPublicationFailure
} from '../../../packages/component-composition-corpus/test-support/router-fetcher-publication-journey.js';

it('fences synchronous release, disposal and replacement at loading publication', () =>
	verifyFetcherPublication(api));
it('retains work started by old abort callbacks during replacement and release', () =>
	verifyFetcherAbortReplacement(api));
it('preserves publication failures and releases only their own work', () =>
	verifyFetcherPublicationFailure(api));
