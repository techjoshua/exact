/**
 * @vitest-environment jsdom
 */
import { createVNode, type Component } from '@exactjs/core';
import { render } from '@exactjs/dom';
import { describe, expect, it } from 'vitest';
import { applyPatches } from './index.js';
import { noopLogger } from './test-support/responses.js';

describe('@exactjs/hydrate patch-validation', () => {
	it('rejects duplicate element protocol ids before mutating live DOM', () => {
		const container = document.createElement('div');
		container.innerHTML = '<p data-exact-id="same">A</p><p data-exact-id="same">B</p>';
		expect(
			applyPatches(container, [{ type: 'text', id: 'same', value: 'changed' }], {
				logger: noopLogger
			})
		).toBe(false);
		expect(container.textContent).toBe('AB');
	});

	it('validates an entire patch batch before mutating live DOM', () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:title-->Old<!--/exact:title-->';
		expect(
			applyPatches(
				container,
				[
					{ type: 'text', id: 'title', value: 'Changed' },
					{ type: 'text', id: 'missing', value: 'Invalid' }
				],
				{ logger: noopLogger }
			)
		).toBe(false);
		expect(container.textContent).toBe('Old');
	});

	it('reserves traversal work for an entire patch batch before mutating live DOM', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:title-->Old<!--/exact:title--><!--exact:panel--><p>Old panel</p><!--/exact:panel-->';
		const before = container.innerHTML;

		expect(() =>
			applyPatches(
				container,
				[
					{ type: 'text', id: 'title', value: 'Changed' },
					{
						type: 'replace',
						id: 'panel',
						html: '<section><span>A</span><span>B</span><span>C</span></section>'
					}
				],
				{ maxTreeNodes: 12 }
			)
		).toThrow('DOM traversal exceeds');
		expect(container.innerHTML).toBe(before);
	});

	it('rejects structurally overlapping patches before mutating live DOM', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:outer--><section><!--exact:inner-->Old<!--/exact:inner--></section><!--/exact:outer-->';
		const before = container.innerHTML;

		expect(
			applyPatches(
				container,
				[
					{ type: 'replace', id: 'outer', html: '<p>Replacement</p>' },
					{ type: 'text', id: 'inner', value: 'Too late' }
				],
				{ logger: noopLogger }
			)
		).toBe(false);
		expect(container.innerHTML).toBe(before);
	});

	it('finishes a prepared patch batch before reporting ownership cleanup failures', () => {
		let owner!: Component<{}>;
		function Owned(this: Component<{}>) {
			owner = this;
			return () => createVNode('button', null, 'Old island');
		}
		const container = document.createElement('div');
		const island = document.createElement('div');
		island.setAttribute('data-exact-client-boundary', 'island');
		container.append(island);
		render(createVNode(Owned, null), island);
		container.insertAdjacentHTML('beforeend', '<!--exact:title-->Old title<!--/exact:title-->');
		(owner as any).scope.reactions.add({
			stop() {
				throw new Error('cleanup failed');
			}
		});

		expect(() =>
			applyPatches(container, [
				{ type: 'replace', id: 'island', html: '<p>New island</p>' },
				{ type: 'text', id: 'title', value: 'New title' }
			])
		).toThrow('cleanup failed');
		expect(container.textContent).toBe('New islandNew title');
	});
});
