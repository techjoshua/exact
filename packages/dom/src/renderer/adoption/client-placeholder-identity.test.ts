/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { clientPlaceholderBoundaryByIdentity } from './component-receipt-identity.js';

it.each([
	[
		'marked',
		'<!--exact:client-boundary:0:DisplayName:owned-->content<!--/exact:client-boundary:0:DisplayName:owned-->',
		'owned',
		2
	],
	['self-describing', '<div data-exact-client-boundary="owned"></div>', 'owned', 0],
	[
		'encoded identity',
		'<!--exact:client-boundary:0:AnyName:~6f776e65643a6368696c64-->content<!--/exact:client-boundary:0:AnyName:~6f776e65643a6368696c64-->',
		'owned:child',
		2
	],
	[
		'wrong identity',
		'<!--exact:client-boundary:0:DisplayName:other-->content<!--/exact:client-boundary:0:DisplayName:other-->',
		'owned',
		undefined
	],
	['wrong element identity', '<div data-exact-client-boundary="other"></div>', 'owned', undefined],
	['unclosed', '<!--exact:client-boundary:0:DisplayName:owned-->content', 'owned', undefined],
	[
		'ordinary component',
		'<!--exact:component:0:owned-->content<!--/exact:component:0:owned-->',
		'owned',
		undefined
	]
] as const)('matches only the owned client placeholder (%s)', (_name, html, identity, endIndex) => {
	const host = document.createElement('div');
	host.innerHTML = html;
	const nodes = [...host.childNodes];
	expect(clientPlaceholderBoundaryByIdentity(nodes, 0, identity)?.endIndex).toBe(endIndex);
	expect([...host.childNodes]).toEqual(nodes);
});
