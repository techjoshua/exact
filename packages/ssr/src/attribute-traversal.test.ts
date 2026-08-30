import { describe, expect, it } from 'vitest';
import { renderAttrs, renderNativeAttribute } from './markup.js';

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
});
