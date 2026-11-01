import { expect, it } from 'vitest';
import { matchRoutes } from './modern.js';

it.each([
	['/app/foo', '/app', 'foo', true],
	['/APP/foo', '/app', 'foo', true],
	['/app/foo', '/app/', 'foo', true],
	['/app', '/app', '/', true],
	['/app/', '/app', '/', true],
	['/apple/foo', '/app', 'le/foo', false],
	['/outside', '/app', 'outside', false],
	['/foo', '/app', 'foo', false],
	['/foo', '/', 'foo', true],
	['/foo', '', 'foo', true]
] as const)(
	'matches %s within basename %s only at a path boundary',
	(path, basename, route, matched) => {
		const routes = [{ id: 'page', path: route }];
		expect(matchRoutes(routes, path, basename)?.map((match) => match.route.id) ?? null).toEqual(
			matched ? ['page'] : null
		);
	}
);

import { verifyCompatibilityBasenames } from '../../../packages/component-composition-corpus/test-support/router-matching-journey.js';
it('executes portable basename controls for string and object locations', () =>
	verifyCompatibilityBasenames({ matchRoutes }));
