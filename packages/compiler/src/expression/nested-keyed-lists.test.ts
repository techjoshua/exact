import { describe, expect, it } from 'vitest';
import { transformSource } from '../index.js';

describe('nested keyed lists', () => {
	it('does not share a component-wide keyed cache across indexed native map callbacks', () => {
		const result = transformSource(
			`
			import type { Component } from '@exactjs/core';
			export function Table(this: Component<{}>, props: { rows: string[]; columns: { name: string; values: number[] }[] }) {
				return () => <table><tbody>{props.rows.map((row, index) =>
					<tr key={row}>{props.columns.map(column => <td key={column.name}>{column.values[index]}</td>)}</tr>
				)}</tbody></table>;
			}
		`,
			{
				filename: 'nested-keyed-table.tsx',
				target: 'client'
			}
		);
		// A shared site cache would reuse the first iteration's captured index for every row.
		expect(result.code).not.toContain('__exactMapKeyedChildren(');
		expect(result.code).not.toContain('this.map(');
		expect(result.code).toContain('__exactKeyedChild(');
		expect(result.code).toContain('column.values[index]');
	});
});
