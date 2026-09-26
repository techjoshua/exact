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
