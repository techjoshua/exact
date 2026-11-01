import { it } from 'vitest';
import { verifyStaticRouterQueries } from '../../../packages/component-composition-corpus/test-support/static-router-query-journey.js';
import { createStaticHandler } from './modern.js';

it('releases static request work on rejection, data publication, and redirection', () =>
	verifyStaticRouterQueries({ createStaticHandler }));
