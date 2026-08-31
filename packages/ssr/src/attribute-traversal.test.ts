import { describe, expect, it } from 'vitest';
import {
	renderAttrs,
	renderCompiledNativeAttribute,
	renderCompiledNativeAttributes,
	renderNativeAttribute
} from './markup.js';

describe('SSR attribute traversal', () => {
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
});
