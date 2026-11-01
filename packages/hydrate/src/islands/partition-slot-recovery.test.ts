/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hydrateClientIslands } from '../islands.js';
import { IslandShell } from '../test-support/islands.fixtures.js';
import { unmount } from '@exactjs/dom/framework/component-root';

const versioned = (id: string, current: boolean) => ({
	__exactServerSlot: id,
	planVersion: 1,
	buildKey: current ? 'current' : 'stale',
	executionRoot: 'page',
	planEdgeId: id,
	ownerComponentId: 'owner',
	discriminator: { kind: 'single' },
	generation: 1
});
const marker = (id: string, content: string) =>
	`<span data-exact-server-slot="${id}" data-exact-partition-version="1" data-exact-partition-build="current" data-exact-partition-root="page" data-exact-partition-edge="${id}" data-exact-partition-owner="owner" data-exact-partition-discriminator="single" data-exact-partition-generation="1">${content}</span>`;

function recover(name: string, children: unknown[], markup: string) {
	const host = document.createElement('main');
	host.innerHTML =
		'<div data-exact-client-boundary="probe" data-exact-client-name="Shell" data-exact-client-hydration="eager"><article>' +
		markup +
		'</article></div>';
	const boundary = host.firstElementChild!;
	boundary.setAttribute('data-exact-client-props', JSON.stringify({ props: { children } }));
	const before = host.innerHTML,
		events: unknown[] = [],
		reports: unknown[] = [];
	try {
		const count = hydrateClientIslands(
			host,
			{ Shell: IslandShell },
			{
				buildKey: 'current',
				onHydration: (event) => events.push(event),
				onErrorReport: (report) => reports.push(String(report))
			}
		);
		const after = host.innerHTML;
		const destination = process.env.EXACT_HANDOFF_AUTHORITY_EVIDENCE_DIR;
		if (destination) {
			mkdirSync(destination, { recursive: true });
			writeFileSync(
				path.join(destination, name + '.json'),
				JSON.stringify({ before, after, count, events, reports }, null, 2)
			);
		}
		expect(count).toBe(1);
		expect(events).toEqual([expect.objectContaining({ outcome: 'mounted' })]);
		expect(reports).toEqual([]);
		return after;
	} finally {
		unmount(boundary);
	}
}

for (const reverse of [false, true]) {
	for (const mode of [
		'stale-outer-id-inner',
		'stale-outer-versioned-inner',
		'valid-outer-stale-inner',
		'matching'
	] as const) {
		it(`finishes nested authority rejection before recovery selection: ${mode}, reverse=${reverse}`, () => {
			const outerCurrent = mode === 'matching' || mode === 'valid-outer-stale-inner';
			const refs = [
				versioned('outer', outerCurrent),
				mode === 'stale-outer-id-inner'
					? { __exactServerSlot: 'inner' }
					: versioned('inner', mode !== 'valid-outer-stale-inner')
			];
			if (reverse) refs.reverse();
			const after = recover(
				mode + '-' + reverse,
				refs,
				marker('outer', 'OUTER' + marker('inner', '<b>INNER</b>'))
			);
			expect(after.includes('OUTER')).toBe(outerCurrent);
			expect(after.includes('INNER')).toBe(mode === 'matching');
		});
	}
	it(`does not retain pre-rejection content through a conflicting reference, reverse=${reverse}`, () => {
		const refs = [versioned('outer', true), versioned('outer', false)];
		if (reverse) refs.reverse();
		expect(recover('conflicting-' + reverse, refs, marker('outer', 'REJECTED'))).not.toContain(
			'REJECTED'
		);
	});
}
it('retains a valid referenced inner range through an ordinary unreferenced shell', () => {
	const after = recover(
		'unreferenced-outer',
		[{ __exactServerSlot: 'inner' }],
		marker('outer', marker('inner', 'INNER'))
	);
	expect(after).toContain('INNER');
	expect(after).not.toContain('data-exact-server-slot="outer"');
});
it('does not grant ambiguous marker IDs recovery ownership', () => {
	const after = recover(
		'ambiguous',
		[{ __exactServerSlot: 'inner' }],
		marker('inner', 'FIRST') + marker('inner', 'SECOND')
	);
	expect(after).not.toContain('FIRST');
	expect(after).not.toContain('SECOND');
});
