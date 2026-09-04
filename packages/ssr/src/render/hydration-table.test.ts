import { describe, expect, it } from 'vitest';
import { SsrHydrationTable } from './hydration-table.js';

describe('finite hydration table schemas', () => {
	it('reuses compiler-bounded schemas across requests without retaining values', () => {
		const first = new SsrHydrationTable();
		expect(first.add('Panel', 'panel-cache-test', { title: 'first', count: 1 })).toBe('0.0');

		const secondProps = new Proxy(
			{ title: 'second', count: 2 },
			{
				ownKeys() {
					throw new Error('cached finite schemas must not enumerate request props');
				}
			}
		);
		const second = new SsrHydrationTable();
		expect(second.add('Panel', 'panel-cache-test', secondProps)).toBe('0.0');
		expect(second.value()).toEqual([
			1,
			[['Panel', ['count', 'title'], [['panel-cache-test', 2, 'second']]]]
		]);
		expect(Object.isFrozen(second.value()?.[1][0]?.[1])).toBe(true);
	});

	it('groups separate boundary IDs with the same component schema', () => {
		const table = new SsrHydrationTable();
		expect(table.add('Panel', 'panel-group-a', { title: 'first' })).toBe('0.0');
		expect(table.add('Panel', 'panel-group-b', { title: 'second' })).toBe('0.1');
		expect(table.value()).toEqual([
			1,
			[
				[
					'Panel',
					['title'],
					[
						['panel-group-a', 'first'],
						['panel-group-b', 'second']
					]
				]
			]
		]);
	});

	it('keeps conditional server-child schemas separate for one boundary ID', () => {
		const withoutChildren = new SsrHydrationTable();
		withoutChildren.add('Panel', 'conditional-child-test', { title: 'empty' });
		const withChildren = new SsrHydrationTable();
		withChildren.add('Panel', 'conditional-child-test', {
			title: 'filled',
			children: { __exactServerSlot: 'child' }
		});

		expect(withoutChildren.value()?.[1][0]?.[1]).toEqual(['title']);
		expect(withChildren.value()?.[1][0]?.[1]).toEqual(['children', 'title']);
	});

	it('rejects a finite boundary ID reused by another component', () => {
		const first = new SsrHydrationTable();
		first.add('Panel', 'boundary-collision-test', {});
		const second = new SsrHydrationTable();
		expect(() => second.add('Dialog', 'boundary-collision-test', {})).toThrow(
			'A finite client boundary ID cannot identify multiple components'
		);
	});
});
