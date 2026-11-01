import { it } from 'vitest';
import {
	verifyRouterRedirectFailures,
	verifyRouterPublicationData,
	verifyRouterFailureOwnership
} from '../../../packages/component-composition-corpus/test-support/router-navigation-journey.js';
import { createExactRouter, createMemoryLocationSource } from './core.js';

const api = { createExactRouter, createMemoryLocationSource };
it('settles direct and action-owned redirect failures before following work', () =>
	verifyRouterRedirectFailures(api));
it('publishes route data only with an accepted history transition', () =>
	verifyRouterPublicationData(api));
it('keeps stale failures and primary errors within their own operation', () =>
	verifyRouterFailureOwnership(api));
