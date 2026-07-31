import { defineExactBoundaryContract, handleExactRequest } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import { createBoundaryRefreshHandler, diffBoundaryHtml, diffKeyedListItems } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/ssr element-diffing', () => {
	it('falls back to replacement patches when text strategy renders html', async () => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'refresh', id: 'profile' }
			},
			{
				contract: {
					version: 1,
					actions: {},
					boundaries: { profile: defineExactBoundaryContract('profile') }
				},
				refreshBoundaries: {
					profile: createBoundaryRefreshHandler(() => createVNode('p', null, 'Ada'), {
						boundaryId: 'profile',
						markers: false,
						patchStrategy: 'text'
					})
				}
			}
		);

		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			patches: [{ type: 'replace', id: 'profile', html: '<p>Ada</p>' }]
		});
	});

	it('targets simple element patches with compiler assigned exact ids', () => {
		expect(
			diffBoundaryHtml(
				'profile',
				'<p data-exact-id="node-1" class="old">Loading</p>',
				'<p data-exact-id="node-1" class="new">Ready</p>',
				'element'
			)
		).toEqual([
			{ type: 'prop', id: 'node-1', name: 'class', value: 'new' },
			{ type: 'text', id: 'node-1', value: 'Ready' }
		]);
	});

	it('creates patches for nested compiler assigned exact ids', () => {
		expect(
			diffBoundaryHtml(
				'profile',
				'<section data-exact-id="root"><h1 data-exact-id="title" class="old">Loading</h1><p data-exact-id="body">Draft</p></section>',
				'<section data-exact-id="root"><h1 data-exact-id="title" class="new">Ready</h1><p data-exact-id="body">Draft</p></section>',
				'element'
			)
		).toEqual([
			{ type: 'prop', id: 'title', name: 'class', value: 'new' },
			{ type: 'text', id: 'title', value: 'Ready' }
		]);
	});

	it('creates style patches for compiler assigned exact ids', () => {
		expect(
			diffBoundaryHtml(
				'profile',
				'<p data-exact-id="body" style="color: red; margin-top: 4px;">Draft</p>',
				'<p data-exact-id="body" style="color: blue; opacity: 1;">Draft</p>',
				'element'
			)
		).toEqual([
			{ type: 'style', id: 'body', name: 'color', value: 'blue' },
			{ type: 'style', id: 'body', name: 'opacity', value: '1' },
			{ type: 'style', id: 'body', name: 'margin-top', value: null }
		]);
	});

	it('replaces compiler-owned dynamic ranges without replacing stable siblings', () => {
		const dynamicId = 'dynamic:x1234567890123456789012';
		expect(
			diffBoundaryHtml(
				'profile',
				`<section data-exact-id="root"><!--exact:${dynamicId}--><p>Loading</p><!--/exact:${dynamicId}--><aside>Stable</aside></section>`,
				`<section data-exact-id="root"><!--exact:${dynamicId}--><ul><li>Ready</li></ul><!--/exact:${dynamicId}--><aside>Stable</aside></section>`,
				'element'
			)
		).toEqual([
			{
				type: 'replace',
				id: dynamicId,
				html: '<ul><li>Ready</li></ul>'
			}
		]);
	});

	it('combines dynamic range replacements with independent element property patches', () => {
		const dynamicId = 'dynamic:x1234567890123456789012';
		expect(
			diffBoundaryHtml(
				'profile',
				`<section data-exact-id="root" class="old"><!--exact:${dynamicId}-->Loading<!--/exact:${dynamicId}--></section>`,
				`<section data-exact-id="root" class="new"><!--exact:${dynamicId}-->Ready<!--/exact:${dynamicId}--></section>`,
				'element'
			)
		).toEqual([
			{
				type: 'replace',
				id: dynamicId,
				html: 'Ready'
			},
			{ type: 'prop', id: 'root', name: 'class', value: 'new' }
		]);
	});

	it('selects one outer compiler range when nested dynamic structures both change', () => {
		const outerId = 'dynamic:x1234567890123456789012';
		const innerId = 'dynamic:xabcdefghijklmnopqrstuv';
		expect(
			diffBoundaryHtml(
				'profile',
				`<!--exact:${outerId}--><article><!--exact:${innerId}-->Old<!--/exact:${innerId}--></article><!--/exact:${outerId}-->`,
				`<!--exact:${outerId}--><section><!--exact:${innerId}-->New<!--/exact:${innerId}--></section><!--/exact:${outerId}-->`,
				'element'
			)
		).toEqual([
			{
				type: 'replace',
				id: outerId,
				html: `<section><!--exact:${innerId}-->New<!--/exact:${innerId}--></section>`
			}
		]);
	});

	it('replaces stable root exact elements when nested exact id structure changes', () => {
		expect(
			diffBoundaryHtml(
				'profile',
				'<section data-exact-id="root"><h1 data-exact-id="title">Loading</h1></section>',
				'<section data-exact-id="root"><h1 data-exact-id="title">Ready</h1><p data-exact-id="body">New</p></section>',
				'element'
			)
		).toEqual([
			{
				type: 'replace',
				id: 'root',
				html: '<section data-exact-id="root"><h1 data-exact-id="title">Ready</h1><p data-exact-id="body">New</p></section>'
			}
		]);
	});

	it('replaces the nearest nested exact element when only that subtree shape changes', () => {
		expect(
			diffBoundaryHtml(
				'profile',
				'<section data-exact-id="root"><article data-exact-id="card"><p data-exact-id="body">Draft</p></article><aside data-exact-id="meta">Stable</aside></section>',
				'<section data-exact-id="root"><article data-exact-id="card"><p data-exact-id="body"><strong>Ready</strong></p></article><aside data-exact-id="meta">Stable</aside></section>',
				'element'
			)
		).toEqual([
			{
				type: 'replace',
				id: 'body',
				html: '<p data-exact-id="body"><strong>Ready</strong></p>'
			}
		]);
	});

	it('does not replace an ancestor when a descendant exact replacement covers the shape change', () => {
		expect(
			diffBoundaryHtml(
				'profile',
				'<section data-exact-id="root" class="old"><article data-exact-id="card"><p data-exact-id="body">Draft</p></article></section>',
				'<section data-exact-id="root" class="new"><article data-exact-id="card"><p data-exact-id="body"><strong>Ready</strong></p></article></section>',
				'element'
			)
		).toEqual([
			{ type: 'prop', id: 'root', name: 'class', value: 'new' },
			{
				type: 'replace',
				id: 'body',
				html: '<p data-exact-id="body"><strong>Ready</strong></p>'
			}
		]);
	});

	it('falls back safely for duplicate exact ids instead of targeting an ambiguous element', () => {
		const previous =
			'<section><p data-exact-id="duplicate">one</p><p data-exact-id="duplicate">two</p></section>';
		const next =
			'<section><p data-exact-id="duplicate">changed</p><p data-exact-id="duplicate">two</p></section>';

		expect(diffBoundaryHtml('profile', previous, next, 'element')).toEqual([
			{ type: 'replace', id: 'profile', html: next }
		]);
	});

	it('falls back to replacement patches when element strategy shape changes', async () => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'refresh', id: 'profile' }
			},
			{
				contract: {
					version: 1,
					actions: {},
					boundaries: { profile: defineExactBoundaryContract('profile') }
				},
				refreshBoundaries: {
					profile: createBoundaryRefreshHandler(() => createVNode('section', null, 'Ready'), {
						boundaryId: 'profile',
						markers: false,
						patchStrategy: 'element',
						previousHtml: () => '<p>Loading</p>'
					})
				}
			}
		);

		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			patches: [{ type: 'replace', id: 'profile', html: '<section>Ready</section>' }]
		});
	});

	it('diffs keyed list snapshots into insert move remove patches', () => {
		expect(
			diffKeyedListItems(
				'tasks',
				[
					{ key: 'a', html: '<li>A</li>' },
					{ key: 'b', html: '<li>B</li>' },
					{ key: 'c', html: '<li>C</li>' }
				],
				[
					{ key: 'c', html: '<li>C</li>' },
					{ key: 'a', html: '<li>A*</li>' },
					{ key: 'd', html: '<li>D</li>' }
				]
			)
		).toEqual([
			{ type: 'list', id: 'tasks', op: 'remove', key: 'a' },
			{ type: 'list', id: 'tasks', op: 'remove', key: 'b' },
			{ type: 'list', id: 'tasks', op: 'insert', key: 'd', html: '<li>D</li>' },
			{ type: 'list', id: 'tasks', op: 'insert', key: 'a', before: 'd', html: '<li>A*</li>' }
		]);
	});
});
