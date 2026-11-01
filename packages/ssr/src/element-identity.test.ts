import { reserveElementId, reservedElementId, type RefBinding, type RefKey } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { createExpression } from '@exactjs/core/framework/render-structure';
import { renderAttrs } from './markup.js';
import { prepareIntrinsicRefAttributes } from './intrinsic-ref-identity.js';
import { renderToString } from './index.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr element identity', () => {
	it('reserves identity for every emitted ref so later relationship consumers are order independent', async () => {
		const binding = testRefBinding<Element>();
		const html = (await renderToString(createOperation('span', { ref: binding }, 'Label'))).html;
		expect(html).toMatch(/ id="exact-[^"]+"/u);
		expect(reservedElementId(binding)).toBeTruthy();
	});

	it('emits a ref identity reserved before intrinsic serialization', async () => {
		const binding = testRefBinding<Element>();
		const id = reserveElementId(binding);
		const html = (await renderToString(createOperation('span', { ref: binding }, 'Label'))).html;
		expect(html).toContain(` id="${id}"`);
		expect(html).not.toContain(' ref=');
	});

	it('lets an authored ID replace a generated reservation', async () => {
		const binding = testRefBinding<Element>();
		reserveElementId(binding);
		const html = (
			await renderToString(createOperation('span', { ref: binding, id: 'authored-label' }, 'Label'))
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

// Compiler-owned bags are prepared before child serialization. Other properties stay lazy.
it('captures effective ref identity once without copying unrelated accessors', () => {
	const binding = testRefBinding<Element>();
	const reads = { ref: 0, id: 0, title: 0 };
	const props = {
		get ref() {
			reads.ref++;
			return createExpression(() => binding);
		},
		get id() {
			reads.id++;
			return createExpression(() => 'authored-help');
		},
		get title() {
			reads.title++;
			expect(this).toBe(props);
			return 'Help';
		}
	};
	const descriptors = Object.getOwnPropertyDescriptors(props);
	const prepared = prepareIntrinsicRefAttributes(props);
	expect(reads).toEqual({ ref: 1, id: 1, title: 0 });
	const html = renderAttrs(prepared as Record<string, unknown>, false, 'span');
	expect(reads).toEqual({ ref: 1, id: 1, title: 1 });
	expect(reservedElementId(binding)).toBe('authored-help');
	expect(html).toContain(' id="authored-help"');
	expect(html.match(/\sid=/gu)).toHaveLength(1);
	expect(Object.getOwnPropertyDescriptors(props)).toEqual(descriptors);
});

it('preserves a prepared reservation and primary error across a later attribute failure', () => {
	const binding = testRefBinding<Element>();
	const primary = new Error('attribute failed');
	let fail = true;
	const props = {
		ref: binding,
		get title() {
			if (fail) throw primary;
			return 'Help';
		}
	};
	const prepared = prepareIntrinsicRefAttributes(props);
	const id = reservedElementId(binding);
	expect(() => renderAttrs(prepared as Record<string, unknown>, false, 'span')).toThrow(primary);
	fail = false;
	const html = renderAttrs(
		prepareIntrinsicRefAttributes(props) as Record<string, unknown>,
		false,
		'span'
	);
	expect(reservedElementId(binding)).toBe(id);
	expect(html).toContain(` id="${id}"`);
	expect(html.match(/\sid=/gu)).toHaveLength(1);
});
