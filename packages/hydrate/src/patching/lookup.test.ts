// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { encodeExactMarkerPart } from '@exactjs/core';
import { createProtocolIndex } from './indexing.js';
import {
	findClientBoundaryElement,
	findExactElement,
	findExactElementTarget,
	findExactItemRange,
	findExactRange,
	findExactTarget,
	findIndexedItem,
	findServerSlotElement,
	isExactItemStart
} from './lookup.js';

function container(html: string): HTMLElement {
	const root = document.createElement('main');
	root.innerHTML = html;
	return root;
}

describe('hydration protocol lookup', () => {
	it('preserves target identity through direct and indexed lookup', () => {
		const root = container(
			'<section data-exact-id="element" data-exact-server-slot="slot" data-exact-client-boundary="client"></section><!--exact:range--><!--ordinary-->text<strong>value</strong><!--/exact:range-->'
		);
		const index = createProtocolIndex(root)!;
		for (const lookup of [undefined, index]) {
			expect(findExactElement(root, 'element', lookup)).toBe(root.firstChild);
			expect(findServerSlotElement(root, 'slot', lookup)).toBe(root.firstChild);
			expect(findClientBoundaryElement(root, 'client', lookup)).toBe(root.firstChild);
			expect(findExactTarget(root, 'element', lookup)).toBe(root.firstChild);
			expect(findExactTarget(root, 'range', lookup)?.textContent).toBe('text');
			expect(findExactElementTarget(root, 'range', lookup)).toBe(root.querySelector('strong'));
			expect(findExactRange(root, 'range', lookup)?.start).toBe(root.childNodes[1]);
			for (const find of [
				findExactElement,
				findServerSlotElement,
				findClientBoundaryElement,
				findExactTarget,
				findExactElementTarget,
				findExactRange
			]) {
				expect(find(root, 'missing', lookup)).toBeUndefined();
			}
		}
	});

	it('keeps empty and comment-only ranges empty and confines attribute searches', () => {
		const root = container(
			'<!--exact:empty--><!--note--><!--/exact:empty--><!--exact:text-->only text<!--/exact:text-->'
		);
		for (const lookup of [undefined, createProtocolIndex(root)!]) {
			expect(findExactTarget(root, 'empty', lookup)).toBeUndefined();
			expect(findExactElementTarget(root, 'empty', lookup)).toBeUndefined();
			expect(findExactElementTarget(root, 'text', lookup)).toBeUndefined();
		}
		root.setAttribute('data-exact-id', 'root');
		expect(findExactElement(root, 'root')).toBe(root);
		expect(findExactElement(document.createElement('main'), 'root')).toBeUndefined();
	});

	it('confines item keys to their enclosing list, including encoded marker keys', () => {
		const key = 'first:é';
		const encoded = encodeExactMarkerPart(key);
		const root = container(
			`<!--exact:outside--><!--exact:item:other:${encoded}-->outside<!--/exact:item:other:${encoded}--><!--/exact:outside--><!--exact:list--><!--exact:item:list:${encoded}-->inside<!--/exact:item:list:${encoded}--><!--/exact:list-->`
		);
		const index = createProtocolIndex(root)!;
		const list = findExactRange(root, 'list', index)!;
		const item = findExactItemRange(root, key, list)!;
		expect(item.start.nextSibling?.textContent).toBe('inside');
		expect(findIndexedItem(index, 'list', key)?.start).toBe(item.start);
		expect(findIndexedItem(index, 'list', encoded)).toBeUndefined();
		expect(findIndexedItem(index, 'missing', key)).toBeUndefined();
		expect(findIndexedItem(index, 'list', 'missing')).toBeUndefined();
		expect(findExactItemRange(root, 'missing', list)).toBeUndefined();
		expect(findExactItemRange(root, key)?.start.nextSibling?.textContent).toBe('outside');
		expect(isExactItemStart(document.createComment('note'), key)).toBe(false);
		expect(isExactItemStart(document.createComment(`exact:item:list:${encoded}`), key)).toBe(true);
	});
});
