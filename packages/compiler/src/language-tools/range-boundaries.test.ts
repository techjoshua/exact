import { expect, it } from 'vitest';
import { overlaps, selectsRange } from './source-ranges.js';

it('intersects nonempty half-open spans without attributing touching or empty reads', () => {
	const source = { start: 10, end: 20 };
	for (const range of [
		{ start: 0, end: 10 },
		{ start: 20, end: 30 },
		{ start: 15, end: 15 },
		{ start: 18, end: 12 }
	]) {
		expect(overlaps(source, range)).toBe(false);
		expect(overlaps(range, source)).toBe(false);
	}
	for (const range of [
		{ start: 10, end: 11 },
		{ start: 19, end: 20 },
		{ start: 0, end: 30 }
	]) {
		expect(overlaps(source, range)).toBe(true);
		expect(overlaps(range, source)).toBe(true);
	}
});

it('selects a task from an interior cursor while excluding its trailing boundary', () => {
	const task = { start: 10, end: 20 };
	for (const position of [10, 15, 19])
		expect(selectsRange(task, { start: position, end: position })).toBe(true);
	for (const position of [9, 20, 21])
		expect(selectsRange(task, { start: position, end: position })).toBe(false);
	expect(selectsRange(task, { start: 0, end: 10 })).toBe(false);
	expect(selectsRange(task, { start: 20, end: 30 })).toBe(false);
	expect(selectsRange(task, { start: 19, end: 21 })).toBe(true);
});
