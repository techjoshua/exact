import { expect, it } from 'vitest';
import { joinHostCursors, splitHostCursors } from './hosts.js';

it('round trips independent host cursors and accepts the retained legacy encoding', () => {
	const cursors = new Map([
		['shop:a', 'sequence:2'],
		['$client', '3']
	]);
	expect([...splitHostCursors(joinHostCursors(cursors))]).toEqual([
		['$client', '3'],
		['shop:a', 'sequence:2']
	]);
	expect([...splitHostCursors('m:client%3A3:server%3A4')]).toEqual([
		['$client', 'client:3'],
		['$server', 'server:4']
	]);
	expect([...splitHostCursors('m:-:server%3A4')]).toEqual([['$server', 'server:4']]);
});

it.each(['m:%:3', 'm:3:%E0%A4%A'])(
	'handles malformed legacy cursor escapes without throwing: %s',
	(cursor) => {
		expect([...splitHostCursors(cursor)]).toEqual([]);
	}
);
