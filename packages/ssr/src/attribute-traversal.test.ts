import { describe, expect, it, vi } from 'vitest';
import {
	renderAttrs,
	renderCompiledNativeAttribute,
	renderCompiledNativeAttributes,
	renderNativeAttribute
} from './markup.js';
import { SsrOutputBuffer, utf8ByteLength } from './render/output-buffer.js';
import { renderSsrRootAttributes } from './render/render-program-attributes.js';
import type { SsrContext } from './types.js';

describe('SSR attribute traversal', () => {
	it('reconstructs scalar root properties only for active target layers', () => {
		const compose = vi.fn((value: unknown) => ({ id: 'row', className: value }));
		const plan = [' id="row"', ['id'], [[1, 'className', 'class']], compose] as const;
		for (const layers of [undefined, [], [{ consumed: true, props: { className: 'unused' } }]]) {
			const context = { targetReceiptLayers: layers } as SsrContext;
			expect(renderSsrRootAttributes(context, ['base', 'a"b'], 'div', plan)).toBe(
				' id="row" class="base a&quot;b"'
			);
		}
		expect(compose).not.toHaveBeenCalled();
		const outputSink = new SsrOutputBuffer(1000);
		const context = {
			outputSink,
			targetReceiptLayers: [{ consumed: false, props: { className: 'caf\u00e9' } }]
		} as unknown as SsrContext;
		const html = renderSsrRootAttributes(context, 'base', 'div', plan, true);
		expect(html).toBe(' id="row" class="base caf\u00e9"');
		expect(compose).toHaveBeenCalledExactlyOnceWith('base');
		expect(context.targetReceiptLayers![0]!.consumed).toBe(true);
		expect(outputSink.encodedBytes()).toBe(utf8ByteLength(html));
	});

	it('preserves proven class output, byte accounting, and generic class fallback', () => {
		const accountKnown = vi.fn();
		const context = { outputSink: { accountKnown } } as unknown as SsrContext;
		for (const value of ['', 'severity', 'severity critical', 'item-1 active_state']) {
			const expected = renderCompiledNativeAttribute(value, 1, 'className', 'class', 'span');
			expect(
				renderCompiledNativeAttribute(value, 7, 'className', 'class', 'span', context, true)
			).toBe(expected);
			expect(accountKnown).toHaveBeenLastCalledWith(expected, Buffer.byteLength(expected));
		}
		expect(renderCompiledNativeAttribute(['base', 'a"b'], 7, 'className', 'class', 'span')).toBe(
			' class="base a&quot;b"'
		);
		expect(renderCompiledNativeAttribute('a"b', 1, 'className', 'class', 'span')).toBe(
			' class="a&quot;b"'
		);
	});

	it('visits only owned native attributes and owned style properties', () => {
		const style = Object.assign(Object.create({ inherited: 'no' }), { color: 'red' });
		const props = Object.assign(Object.create({ title: 'inherited' }), {
			id: 'owned',
			onClick: () => undefined,
			style
		});

		expect(renderAttrs(props, false, 'div')).toBe(' id="owned" style="color: red;"');
	});

	it('preserves React form-control ordering without entry or pair arrays', () => {
		const props = {
			value: 'parcel',
			id: 'shipping',
			name: 'service',
			checked: true,
			type: 'radio'
		};

		expect(renderAttrs(props, 19, 'input')).toBe(
			' type="radio" name="service" id="shipping" checked="" value="parcel"'
		);
	});

	it('serializes compiler-known native values without materializing a prop bag', () => {
		expect(renderNativeAttribute(['primary', { active: true }], 'className', 'button')).toBe(
			' class="primary active"'
		);
		expect(renderNativeAttribute(false, 'disabled', 'button')).toBe('');
		expect(renderNativeAttribute('/cases?a=1&b=2', 'href', 'a')).toBe(' href="/cases?a=1&amp;b=2"');
	});

	it('executes compiler-selected native attribute behavior without generic classification', () => {
		expect(
			renderCompiledNativeAttribute(
				['primary', { active: true }],
				1,
				'className',
				'class',
				'button'
			)
		).toBe(' class="primary active"');
		expect(renderCompiledNativeAttribute({ color: 'red' }, 2, 'style', 'style', 'div')).toBe(
			' style="color: red;"'
		);
		expect(renderCompiledNativeAttribute('/cases?a=1&b=2', 3, 'href', 'href', 'a')).toBe(
			' href="/cases?a=1&amp;b=2"'
		);
		expect(renderCompiledNativeAttribute(true, 0, 'required', 'required', 'textarea')).toBe(
			' required'
		);
	});

	it('keeps non-string compiled class values on the recursive normalization path', () => {
		expect(
			renderCompiledNativeAttribute(
				['primary', { active: true }],
				1,
				'className',
				'class',
				'button'
			)
		).toBe(' class="primary active"');
		expect(renderCompiledNativeAttribute('', 1, 'className', 'class', 'button')).toBe(' class=""');
	});

	it('delegates accounted compiler-selected values to the environment byte operation', () => {
		const encodedByteLength = vi.fn(utf8ByteLength);
		const outputSink = new SsrOutputBuffer(100, undefined, encodedByteLength);
		const context = { outputSink } as SsrContext;

		expect(
			renderCompiledNativeAttribute('caf\u00e9', 0, 'title', 'title', 'div', context, true)
		).toBe(' title="caf\u00e9"');
		expect(renderCompiledNativeAttribute('"<&>', 0, 'title', 'title', 'div', context, true)).toBe(
			' title="&quot;&lt;&amp;&gt;"'
		);
		expect(outputSink.encodedBytes()).toBe(
			utf8ByteLength(' title="caf\u00e9" title="&quot;&lt;&amp;&gt;"')
		);
		expect(encodedByteLength).toHaveBeenCalledTimes(2);
	});

	it('executes a closed root plan in compiler order', () => {
		const props = {
			className: ['incident', { active: true }],
			disabled: false,
			'data-exact-id': 'row-1'
		};
		expect(
			renderCompiledNativeAttributes(
				props,
				[
					[0, 'data-exact-id', 'data-exact-id'],
					[1, 'className', 'class'],
					[0, 'disabled', 'disabled']
				],
				'button'
			)
		).toBe(' data-exact-id="row-1" class="incident active"');
	});

	it('uses static compiler identity only until a semantic target changes the prop bag', () => {
		const props = { 'data-exact-id': 'row-1', className: 'incident' };
		const staticRoot = [
			' data-exact-id="row-1"',
			['data-exact-id'],
			[[7, 'className', 'class']]
		] as const;

		expect(renderSsrRootAttributes({} as SsrContext, props, 'button', staticRoot)).toBe(
			' data-exact-id="row-1" class="incident"'
		);
		const context = {
			targetReceiptLayers: [
				{ props: { 'aria-label': 'incident', className: 'a"b' }, consumed: false }
			]
		} as unknown as SsrContext;
		expect(renderSsrRootAttributes(context, props, 'button', staticRoot)).toBe(
			' data-exact-id="row-1" class="incident a&quot;b" aria-label="incident"'
		);
	});
});
