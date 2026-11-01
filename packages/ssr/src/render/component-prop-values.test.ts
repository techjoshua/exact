import { createPreparedServerComponentInputReference } from '@exactjs/core/framework/server-render-structure';
import { expect, it } from 'vitest';
import { createExpression } from '@exactjs/core/runtime/render-operations';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from './render-output.js';
import {
	ScalarProp,
	ScheduledScalarProp,
	CapturedChildInput,
	CapturedChildValue
} from './component-prop-values.fixtures.test.js';
it.each([
	['synchronous', ScalarProp],
	['scheduled', ScheduledScalarProp]
] as const)(
	'preserves expression values across direct server entry (%s)',
	async (_name, component) => {
		for (const value of [false, true, 0, -0, '', 'ready', null, undefined, NaN]) {
			const plain = createCompiledComponentInputReceipt(component, { value });
			const wrapped = createCompiledComponentInputReceipt(component, {
				value: createExpression(() => value)
			});
			expect((await renderToString(wrapped, { markers: false })).html).toBe(
				(await renderToString(plain, { markers: false })).html
			);
		}
	}
);

it('uses one framework child acquisition while authored nested reads keep ordinary receivers', async () => {
	const first = createCompiledComponentInputReceipt(CapturedChildValue, { value: 'first' });
	const later = createCompiledComponentInputReceipt(CapturedChildValue, { value: 'later' });
	let childrenReads = 0,
		otherReads = 0;
	const seen: unknown[] = [];
	const props = {
		get children() {
			return ++childrenReads === 1 ? first : later;
		},
		get other() {
			otherReads++;
			seen.push(this.children);
			return String(otherReads);
		}
	};
	const result = await renderToString(
		createPreparedServerComponentInputReference(CapturedChildInput, props),
		{ markers: false }
	);
	expect(childrenReads).toBe(1 + otherReads);
	expect(otherReads).toBeGreaterThanOrEqual(2);
	expect(seen.every((value) => value === later)).toBe(true);
	expect(result.html).toContain('data-same="true"');
	expect(result.html).toContain('<i>first</i>');
	expect(result.html).not.toContain('<i>later</i>');
});

import { createComponentPropExpression } from '@exactjs/core/runtime/render-operations';
import { computed } from '@exactjs/reactive';
import { redeemComponentInput } from '@exactjs/core/runtime/component-operations';
import {
	prepareServerComponentInputs,
	serverComponentInputProvider
} from './server-component-reference.js';

it('acquires eager marked children before normalizing their authored output on the server', async () => {
	let reads = 0;
	const child = createPreparedServerComponentInputReference(CapturedChildValue, {
		value: 'marked'
	});
	const operand = createComponentPropExpression(() => {
		reads++;
		return [child];
	});
	const operation = createPreparedServerComponentInputReference(
		CapturedChildInput,
		{},
		{
			kind: 'eager',
			values: [['before', [operand], 'after']]
		}
	);
	expect(reads).toBe(0);
	const result = await renderToString(operation, { markers: false });
	expect(reads).toBe(1);
	expect(result.html).toContain('before<i>marked</i>after');
});

it('keeps reader acquisition once and authored reactive child payloads opaque in server inputs', () => {
	let readerReads = 0,
		authoredReads = 0,
		calls = 0;
	const authored = computed(() => ++authoredReads),
		callable = () => ++calls;
	const operand = createComponentPropExpression(() => [authored, callable]);
	const operation = createPreparedServerComponentInputReference(
		CapturedChildInput,
		{},
		{
			kind: 'reader',
			read: () => {
				readerReads++;
				return [operand];
			}
		}
	);
	const record = prepareServerComponentInputs(
		redeemComponentInput(operation, serverComponentInputProvider),
		{},
		{}
	);
	expect(readerReads).toBe(1);
	expect(record.inputs.children[0]).toBe(authored);
	expect(record.inputs.children[1]).toBe(callable);
	expect([authoredReads, calls]).toEqual([0, 0]);
});
