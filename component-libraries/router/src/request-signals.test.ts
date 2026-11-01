import { it } from 'vitest';
import * as api from './core.js';
import { verifyHandlerRequestSignals } from '../../../packages/component-composition-corpus/test-support/router-request-cancellation-journey.js';
it('carries owned cancellation into loader, action and fetcher Request objects', () =>
	verifyHandlerRequestSignals(api));
