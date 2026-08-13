import { describe, expect, it } from 'vitest';
import { transform } from './index.js';

describe('native Intl cache lowering', () => {
	it('eliminates finite formatter bindings and routes component operations through this.intl', () => {
		const output = transform(
			`import type { Component } from '@exactjs/core';
			const ordinals = new Intl.PluralRules('en-US', { type: 'ordinal' });
			export function Card(this: Component<{ count: number }>, props: { date: Date }) {
				return () => <p>
					{ordinals.select(this.state.count)}
					{new Intl.NumberFormat('en-US').format(this.state.count)}
					{this.state.count.toLocaleString('en-US')}
					{this.state.count.toLocaleString()}
					{props.date.toLocaleDateString('en-US')}
					{props.date.toLocaleString()}
				</p>;
			}`,
			{ filename: 'Card.tsx' }
		);

		expect(output).not.toContain('new Intl.');
		expect(output).not.toContain('const ordinals');
		expect(output).toContain("this.intl.PluralRules('en-US', { type: 'ordinal' }).select");
		expect(output).toContain("this.intl.NumberFormat('en-US').format");
		expect(output).toContain('this.intl.formatNumber');
		expect(output).toContain('this.intl.formatDate');
	});

	it('uses the exported global facade outside components and preserves escaping objects', () => {
		const output = transform(
			`const visible = new Intl.NumberFormat('en-US');
			export function inspect() { return visible; }
			export function amount(value: number) {
				return new Intl.NumberFormat('en-US', { style: 'decimal' }).format(value);
			}`,
			{ filename: 'format.ts' }
		);

		expect(output).toContain('intl as __exactIntl');
		expect(output).toContain("const visible = __exactIntl.NumberFormat('en-US')");
		expect(output).toContain(
			"__exactIntl.NumberFormat('en-US', { style: 'decimal' }).format(value)"
		);
	});

	it('keeps exported formatter bindings observable while caching their construction', () => {
		const output = transform(
			`export const shared = new Intl.NumberFormat('en-US');
			export function amount(value: number) { return shared.format(value); }`,
			{ filename: 'shared.ts' }
		);

		expect(output).toContain("export const shared = __exactIntl.NumberFormat('en-US')");
		expect(output).toContain('return shared.format(value)');
	});

	it('does not rewrite a shadowed Intl namespace or custom locale method', () => {
		const output = transform(
			`const Intl = { NumberFormat: class { format(value: number) { return String(value); } } };
			const custom = { toLocaleString() { return 'custom'; } };
			export function View() { return () => <p>{new Intl.NumberFormat().format(1)} {custom.toLocaleString()}</p>; }`,
			{ filename: 'custom.tsx' }
		);

		expect(output).toContain('new Intl.NumberFormat()');
		expect(output).toContain('custom.toLocaleString()');
		expect(output).not.toContain('this.intl.NumberFormat');
	});
});
