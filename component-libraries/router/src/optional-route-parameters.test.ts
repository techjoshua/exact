import { expect, it } from 'vitest';
import { generatePath, matchPath, matchRoutes } from './core.js';

it.each(['/about', '/en/about'])(
	'matches an optional parameter before a literal in standalone and branch paths',
	(path) => {
		const params = path === '/about' ? {} : { language: 'en' };
		expect(matchPath('/:language?/about', path)?.params).toEqual(params);
		expect(matchRoutes([{ id: 'page', path: '/:language?/about' }], path).at(-1)?.params).toEqual(
			params
		);
	}
);

it('omits a parent parameter when its child needs the segment', () => {
	const routes = [{ id: 'parent', path: '/:language?', children: [{ id: 'page', path: 'about' }] }];
	expect(matchRoutes(routes, '/about').map((match) => [match.id, match.params])).toEqual([
		['parent', {}],
		['page', {}]
	]);
	expect(matchRoutes(routes, '/en/about').at(-1)?.params).toEqual({ language: 'en' });
});

it('matches generated omitted paths and retains greedy parameter preference when both parses work', () => {
	const path = '/:first?/:second?/about';
	expect(matchPath(path, generatePath(path, {}))?.params).toEqual({});
	expect(matchPath(path, '/en/about')?.params).toEqual({ first: 'en' });
	expect(matchPath(path, '/en/mobile/about')?.params).toEqual({ first: 'en', second: 'mobile' });
	expect(matchPath(path, '/en/mobile/other')).toBeNull();
});

it('supports omitted parameters before a splat while preserving its range base', () => {
	expect(matchPath('/:language?/files/*', '/files/a/b')).toMatchObject({
		params: { '*': 'a/b' },
		pathnameBase: '/files'
	});
	expect(matchPath('/:language?/files/*', '/en/files/a/b')).toMatchObject({
		params: { language: 'en', '*': 'a/b' },
		pathnameBase: '/en/files'
	});
});

it('preserves prefix matching and case sensitivity with optional parameters', () => {
	expect(matchPath({ path: '/:language?/About', end: false }, '/about/more')?.params).toEqual({});
	expect(matchPath({ path: '/:language?/About', caseSensitive: true }, '/about')).toBeNull();
	expect(matchPath({ path: '/:language?/About', caseSensitive: true }, '/About')?.params).toEqual(
		{}
	);
});

it('ranks omitted optional parameters by the path actually matched and retains declaration ties', () => {
	const literal = { id: 'literal', path: '/about' };
	const optional = { id: 'optional', path: '/:language?/about' };
	expect(matchRoutes([literal, optional], '/about').at(-1)?.id).toBe('literal');
	expect(matchRoutes([optional, literal], '/about').at(-1)?.id).toBe('optional');
	expect(matchRoutes([literal, optional], '/en/about').at(-1)?.id).toBe('optional');
});

it('bounds ambiguous optional-pattern matching while retaining valid and invalid controls', () => {
	const path = '/' + Array.from({ length: 96 }, (_, index) => `:p${index}?`).join('/') + '/done';
	const prefix = '/' + Array.from({ length: 48 }, () => 'value').join('/');
	const match = matchPath(path, prefix + '/done');
	expect(Object.keys(match?.params ?? {})).toHaveLength(48);
	expect(match?.params.p0).toBe('value');
	expect(match?.params.p47).toBe('value');
	expect(match?.params.p48).toBeUndefined();
	expect(matchPath(path, prefix + '/missing')).toBeNull();
});

it('shares omission decisions across an absolute child prefix', () => {
	const routes = [
		{ id: 'parent', path: '/:language?', children: [{ id: 'child', path: '/:language?/about' }] }
	];
	expect(
		matchRoutes(routes, '/about').map((match) => [match.id, match.params, match.pathname])
	).toEqual([
		['parent', {}, '/'],
		['child', {}, '/about']
	]);
	expect(matchRoutes(routes, '/en/about').map((match) => match.params)).toEqual([
		{ language: 'en' },
		{ language: 'en' }
	]);
});

it('respects stricter absolute-child case policy while choosing omissions', () => {
	const routes = [
		{
			id: 'parent',
			path: '/:prefix?/A',
			children: [{ id: 'child', path: '/:prefix?/A/:tail?', caseSensitive: true }]
		}
	];
	const matches = matchRoutes(routes, '/A/a');
	expect(matches.map((match) => match.id)).toEqual(['parent', 'child']);
	expect(matches[0]?.params).toEqual({});
	expect(matches[1]?.params).toEqual({ tail: 'a' });
});

it('retains optional omission and capture through an index child', () => {
	const routes = [{ id: 'parent', path: '/:language?', children: [{ id: 'index', index: true }] }];
	expect(matchRoutes(routes, '/').map((match) => [match.id, match.params])).toEqual([
		['parent', {}],
		['index', {}]
	]);
	expect(matchRoutes(routes, '/en').map((match) => match.params)).toEqual([
		{ language: 'en' },
		{ language: 'en' }
	]);
});

it('recognizes generated paths across omitted, ambiguous and encoded optional values', () => {
	for (const pattern of [
		'/:a?/home',
		'/:a?/:b?/home',
		'/home/:a?/:b?',
		'/:a?/home/:b?',
		'/:a?/:b?/home/*'
	])
		for (const a of [undefined, 'value', 'home', 'a/b', '?'])
			for (const b of [undefined, 'value', 'home', 'a/b', '?']) {
				const path = generatePath(pattern, { a, b, '*': 'tail/part' });
				expect(matchPath(pattern, path), pattern + ' at ' + path).not.toBeNull();
			}
});
