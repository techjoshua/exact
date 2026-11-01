import { expect, it } from 'vitest';
import { matchRoutes } from './core.js';

it.each(['/home', '/home/child', '/home/child/grand'])(
	'matches the contributing branch ending at %s',
	(path) => {
		const routes = [
			{
				id: 'parent',
				path: '/home',
				children: [{ id: 'child', path: 'child', children: [{ id: 'grand', path: 'grand' }] }]
			}
		];
		const count = path.split('/').length - 1;
		expect(matchRoutes(routes, path).map((match) => match.id)).toEqual(
			['parent', 'child', 'grand'].slice(0, count)
		);
	}
);

it('matches an explicit root parent and prefers its index when present', () => {
	const parent = { id: 'parent', path: '/', children: [{ id: 'child', path: 'child' }] };
	expect(matchRoutes([parent], '/').map((match) => match.id)).toEqual(['parent']);
	expect(
		matchRoutes(
			[{ ...parent, children: [...parent.children, { id: 'index', index: true }] }],
			'/'
		).map((match) => match.id)
	).toEqual(['parent', 'index']);
});

it('preserves specificity, stable declaration ties and unmatched paths', () => {
	const routes = [
		{ id: 'first', path: '/:first' },
		{ id: 'second', path: '/:second' },
		{ id: 'literal', path: '/home' },
		{ id: 'splat', path: '/files/*' }
	];
	expect(matchRoutes(routes, '/home').at(-1)?.id).toBe('literal');
	expect(matchRoutes(routes, '/other').at(-1)).toMatchObject({
		id: 'first',
		params: { first: 'other' }
	});
	expect(matchRoutes(routes, '/files/a/b').at(-1)?.id).toBe('splat');
	expect(matchRoutes(routes, '/no/match')).toEqual([]);
});

it.each(['/files/a/b', '/files/a%2Fb', '/files/a%2Fb/c'])(
	'keeps the splat base in URL segment space for %s',
	(path) => {
		expect(matchRoutes([{ id: 'files', path: '/files/*' }], path).at(-1)?.pathnameBase).toBe(
			'/files'
		);
	}
);

import * as api from './core.js';
import {
	verifyRouteMatching,
	verifyRouteMatchingTransitions
} from '../../../packages/component-composition-corpus/test-support/router-matching-journey.js';
it('executes portable matching controls', () => verifyRouteMatching(api));
it('loads matched branches through live route transitions', () =>
	verifyRouteMatchingTransitions(api));
