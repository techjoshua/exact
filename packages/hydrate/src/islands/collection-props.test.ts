/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { encodeReactiveProtocolValue } from '@exactjs/core';
import { parseIslandPayload } from './boundary-props.js';

it('preserves nested collection props while reviving independent island payloads', () => {
	const rows = new Map([['first', { selected: new Set(['a', 'b']) }]]);
	const payload = JSON.stringify(encodeReactiveProtocolValue({ props: { rows } }));
	const restored = parseIslandPayload(payload, {}).props.rows;
	expect(restored).toBeInstanceOf(Map);
	expect(restored).toEqual(rows);
});

import { retainedServerSlotElements } from './partition-slots.js';
import { createDomWorkBudget } from '@exactjs/dom/root';

it('carries valid nested collection ranges once and drops ambiguous or unreferenced markers', () => {
	const boundary = document.createElement('div');
	boundary.innerHTML =
		'<span data-exact-server-slot="outer"><span data-exact-server-slot="inner">Retained</span></span><span data-exact-server-slot="ambiguous">First</span><span data-exact-server-slot="ambiguous">Second</span><span data-exact-server-slot="unreferenced">Unused</span>';
	const slot = (id: string) => ({ __exactServerSlot: id });
	const payload = JSON.stringify(
		encodeReactiveProtocolValue({
			props: {
				rows: new Map([
					[
						'one',
						new Set([
							slot('outer'),
							slot('inner'),
							slot('outer'),
							slot('ambiguous'),
							slot('missing')
						])
					]
				])
			}
		})
	);
	const decoded = parseIslandPayload(payload, {}, boundary);
	expect(decoded.props.rows).toBeInstanceOf(Map);
	expect(retainedServerSlotElements(decoded.serverSlots, createDomWorkBudget())).toEqual([
		boundary.querySelector('[data-exact-server-slot="outer"]')
	]);
});
