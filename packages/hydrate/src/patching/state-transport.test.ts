// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { encodeReactiveProtocolValue, decodeReactiveProtocolValue } from '@exactjs/core';
import { createExactClient } from '../index.js';
import { testContinuation } from '../test-support/responses.js';

it.each([undefined, NaN, Infinity, -Infinity, -0, new Map([['key', 'value']]), new Set(['value'])])(
	'preserves a state patch through transport and DOM publication (%s)',
	async (value) => {
		const container = document.createElement('main');
		container.innerHTML = '<div data-exact-id="panel"></div>';
		const data = { own: value };
		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: {},
			continuations: { save: testContinuation('save', { boundaries: ['panel'] }) },
			fetch: async () =>
				new Response(
					JSON.stringify(
						encodeReactiveProtocolValue({
							ok: true,
							type: 'invoke',
							id: 'save',
							patches: [{ type: 'state', id: 'panel', value: data }]
						})
					),
					{ headers: { 'content-type': 'application/json' } }
				)
		});
		try {
			await client.invokeTask('save');
			const decoded = decodeReactiveProtocolValue(
				JSON.parse(container.firstElementChild!.getAttribute('data-exact-state')!)
			) as { own: unknown };
			expect(Object.hasOwn(decoded, 'own')).toBe(true);
			if (value instanceof Map || value instanceof Set) expect(decoded.own).toEqual(value);
			else expect(Object.is(decoded.own, value)).toBe(true);
		} finally {
			client.dispose();
		}
	}
);
