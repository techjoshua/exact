import { type Component } from '@exactjs/core';
import '@exactjs/core/runtime/lists';
import { describe, expect, it } from 'vitest';
import {
	diffKeyedListItems,
	parseKeyedListSnapshotHtml,
	renderKeyedListSnapshot,
	renderToString
} from './index.js';
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/ssr keyed-lists', () => {
	it('renders keyed list fragments with item markers', () => {
		function List(this: Component<{}>) {
			return () =>
				this.map(
					[
						{ id: 'a', label: 'A' },
						{ id: 'b', label: 'B' }
					],
					(item) => item.id,
					(item) => createVNode('li', null, item.label)
				);
		}

		const result = renderToString(createVNode('ul', null, createVNode(List, {})));

		expect(result.html).toContain('exact:item');
		expect(result.html).toContain(':a');
		expect(result.html).toContain(':b');
		expect(result.html).toContain('<li>A</li>');
		expect(result.html).toContain('<li>B</li>');
	});

	it('renders keyed list fragments with stable exact markers when map ids are provided', () => {
		function List(this: Component<{}>) {
			return () =>
				this.map(
					[{ id: 'a', label: 'A' }],
					(item) => item.id,
					(item) => createVNode('li', null, item.label),
					'tasks'
				);
		}

		const result = renderToString(createVNode('ul', null, createVNode(List, {})));

		expect(result.html).toContain('<!--exact:tasks-->');
		expect(result.html).toContain('<!--/exact:tasks-->');
		expect(result.html).toContain('<!--exact:item:');
	});

	it('uses an LIS so a keyed rotation emits only one move', () => {
		const previous = ['a', 'b', 'c', 'd'].map((key) => ({ key, html: `<li>${key}</li>` }));
		const next = [previous[3]!, ...previous.slice(0, 3)];
		expect(diffKeyedListItems('tasks', previous, next)).toEqual([
			{ type: 'list', id: 'tasks', op: 'move', key: 'd', before: 'a' }
		]);
	});

	it('rejects duplicate keyed snapshots deterministically', () => {
		expect(() =>
			diffKeyedListItems(
				'tasks',
				[
					{ key: 'a', html: 'A' },
					{ key: 'a', html: 'A again' }
				],
				[]
			)
		).toThrow('Duplicate key "a" in previous keyed-list snapshot');
		expect(() =>
			diffKeyedListItems(
				'tasks',
				[],
				[
					{ key: 'a', html: 'A' },
					{ key: 'a', html: 'A again' }
				]
			)
		).toThrow('Duplicate key "a" in next keyed-list snapshot');
	});

	it('diffs ten thousand keyed records without quadratic scans', () => {
		const previous = Array.from({ length: 10_000 }, (_, index) => ({
			key: String(index),
			html: `<li>${index}</li>`
		}));
		const next = [previous.at(-1)!, ...previous.slice(0, -1)];
		expect(diffKeyedListItems('tasks', previous, next)).toEqual([
			{ type: 'list', id: 'tasks', op: 'move', key: '9999', before: '0' }
		]);
	});

	it('renders keyed list snapshots with list and item markers', () => {
		const snapshot = renderKeyedListSnapshot({
			listId: 'tasks',
			items: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' }
			],
			key: (item) => item.id,
			render: (item) => createVNode('li', null, item.label)
		});

		expect(snapshot.html).toContain('<!--exact:tasks-->');
		expect(snapshot.html).toContain('<!--/exact:tasks-->');
		expect(snapshot.items).toEqual([
			{ key: 'a', html: '<!--exact:item:a--><li>A</li><!--/exact:item:a-->' },
			{ key: 'b', html: '<!--exact:item:b--><li>B</li><!--/exact:item:b-->' }
		]);
		expect(snapshot.innerHtml).toBe(snapshot.items.map((item) => item.html).join(''));
	});

	it('rejects duplicate keys while rendering keyed snapshots', () => {
		expect(() =>
			renderKeyedListSnapshot({
				listId: 'tasks',
				items: [{ id: 'a' }, { id: 'a' }],
				key: (item) => item.id,
				render: (item) => createVNode('li', null, item.id)
			})
		).toThrow('Duplicate key "a" in keyed-list snapshot');
	});

	it('fails closed for duplicate, malformed, or oversized keyed snapshot markup', () => {
		const item = '<!--exact:item:a--><li>A</li><!--/exact:item:a-->';
		expect(parseKeyedListSnapshotHtml('tasks', `${item}${item}`)).toBeUndefined();
		expect(
			parseKeyedListSnapshotHtml('tasks', '<!--exact:item:a--><li>A</li><!--/exact:item:b-->')
		).toBeUndefined();
		expect(parseKeyedListSnapshotHtml('tasks', item, { maxBytes: 16 })).toBeUndefined();
		expect(parseKeyedListSnapshotHtml('tasks', item, { maxBytes: item.length })).toBeUndefined();
		expect(parseKeyedListSnapshotHtml('tasks', item, { maxMarkers: 1 })).toBeUndefined();
	});

	it('parses nested item markers in linear stack time without treating them as sibling keys', () => {
		const depth = 2_000;
		const html =
			`${Array.from({ length: depth }, (_, index) => `<!--exact:item:${index}-->`).join('')}` +
			`${Array.from({ length: depth }, (_, index) => `<!--/exact:item:${depth - index - 1}-->`).join('')}`;
		const snapshot = parseKeyedListSnapshotHtml('tasks', html, { maxMarkers: depth * 2 + 1 });

		expect(snapshot?.items).toHaveLength(1);
		expect(snapshot?.items[0]?.key).toBe('0');
	});
});
