import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generatePath as exactGeneratePath } from './core.js';
import { matchPath as exactMatchPath } from './modern.js';

const fixtureRoot = process.env.EXACT_REACT_ROUTER_V63_FIXTURE;

describe.skipIf(!fixtureRoot)('isolated React Router v6.3 compatibility', () => {
	it('retains pre-data declarative helper semantics without installing v6.3 in the root graph', async () => {
		const require = createRequire(path.join(fixtureRoot!, 'package.json'));
		const actual = (await import(pathToFileURL(require.resolve('react-router-dom')).href)) as {
			matchPath(pattern: { path: string; end: boolean }, pathname: string): unknown;
			generatePath(path: string, params: Record<string, string>): string;
			createMemoryRouter?: unknown;
		};
		const scenarios = [
			['/teams/exact', { path: '/teams/:team', end: true }],
			['/teams/exact/members', { path: '/teams/:team', end: false }],
			['/elsewhere', { path: '/teams/:team', end: false }]
		] as const;
		for (const [pathname, pattern] of scenarios)
			expect(normalize(exactMatchPath(pattern, pathname))).toEqual(
				normalize(actual.matchPath(pattern, pathname))
			);
		expect(exactGeneratePath('/teams/:team', { team: 'exact' })).toBe(
			actual.generatePath('/teams/:team', { team: 'exact' })
		);
		expect(actual.createMemoryRouter).toBeUndefined();
	});
});

function normalize(value: unknown): unknown {
	if (!value || typeof value !== 'object') return null;
	const match = value as { params?: unknown; pathname?: unknown; pathnameBase?: unknown };
	return {
		params: match.params,
		pathname: match.pathname,
		pathnameBase: match.pathnameBase
	};
}
