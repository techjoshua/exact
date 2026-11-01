// @vitest-environment jsdom
import { it } from 'vitest';
import { createExactClient } from './index.js';
import { readNdjsonEvents } from './response/ndjson.js';
import { verifyHydrationCancellation } from '../../component-composition-corpus/test-support/hydration-cancellation-journey.js';
it('retains exact cancellation reasons and wire validation', () =>
	verifyHydrationCancellation({ createExactClient, readNdjsonEvents }, document));
