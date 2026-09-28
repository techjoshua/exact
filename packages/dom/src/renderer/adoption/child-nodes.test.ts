/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { snapshotChildRange } from './child-nodes.js';

it('retains only the requested content and its closing insertion anchor', () => {
	const parent = document.createElement('div');
	parent.innerHTML = 'before<!--start--><span>content</span><!--end-->after';
	const start = parent.childNodes[1]!;
	const content = parent.childNodes[2]!;
	const end = parent.childNodes[3]!;
	expect(snapshotChildRange(parent, start.nextSibling, end)).toEqual([content, end]);
	expect(snapshotChildRange(parent, end, end)).toEqual([end]);
	expect(snapshotChildRange(parent, end.nextSibling, null)).toEqual([parent.lastChild]);
	expect(snapshotChildRange(parent, null, null)).toEqual([]);
	expect(snapshotChildRange(parent, end, start)).toBeUndefined();
	expect(snapshotChildRange(parent, null, end)).toBeUndefined();
	const detached = document.createComment('detached');
	expect(snapshotChildRange(parent, detached, null)).toBeUndefined();
	expect(snapshotChildRange(parent, content, detached)).toBeUndefined();
	const snapshot = snapshotChildRange(parent, content, end);
	content.remove();
	expect(snapshot).toEqual([content, end]);
});
