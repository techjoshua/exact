import { reserveElementId, reservedElementId, type RefBinding, type RefKey } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { renderToString } from './index.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr element identity', () => {
	it('reserves identity for every emitted ref so later relationship consumers are order independent', () => {
		const binding = testRefBinding<Element>();
		const html = renderToString(createOperation('span', { ref: binding }, 'Label')).html;
		expect(html).toMatch(/ id="exact-[^"]+"/u);
		expect(reservedElementId(binding)).toBeTruthy();
	});

	it('emits a ref identity reserved before intrinsic serialization', () => {
		const binding = testRefBinding<Element>();
		const id = reserveElementId(binding);
		const html = renderToString(createOperation('span', { ref: binding }, 'Label')).html;
		expect(html).toContain(` id="${id}"`);
		expect(html).not.toContain(' ref=');
	});

	it('lets an authored ID replace a generated reservation', () => {
		const binding = testRefBinding<Element>();
		reserveElementId(binding);
		const html = renderToString(
			createOperation('span', { ref: binding, id: 'authored-label' }, 'Label')
		).html;
		expect(html).toContain(' id="authored-label"');
		expect(html.match(/\sid=/gu)).toHaveLength(1);
	});
});

function testRefBinding<T>(): RefBinding<T> {
	let current: T | undefined;
	return {
		get current() {
			return current;
		},
		key: { id: Symbol('ssr-ref'), description: 'ssr ref' } as RefKey<T>,
		owner: {} as RefBinding<T>['owner'],
		fulfill(value) {
			current = value;
		}
	};
}
