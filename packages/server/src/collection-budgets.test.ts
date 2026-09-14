import { describe, expect, it } from 'vitest';
import { isJsonSafe as serverSafe } from './protocol.js';
import { isJsonSafe as clientSafe } from '../../hydrate/src/validation.js';

describe('decoded collection validation budgets', () => {
	it.each([serverSafe, clientSafe])('reserves node capacity for queued siblings', (validate) => {
		const value = [
			0,
			new Map([
				[1, 2],
				[3, 4]
			])
		];
		expect(validate(value, { maxNodes: 5 })).toBe(true);
		expect(validate(value, { maxNodes: 4 })).toBe(false);
	});

	it.each([serverSafe, clientSafe])(
		'bounds Map iterators independently of reported size',
		(validate) => {
			let visited = 0;
			class CountedMap extends Map<number, number> {
				get size() {
					return 0;
				}
				*[Symbol.iterator](): MapIterator<[number, number]> {
					for (const entry of super.entries()) {
						visited++;
						yield entry;
					}
					return undefined;
				}
			}
			expect(
				validate(
					new CountedMap([
						[1, 1],
						[2, 2],
						[3, 3],
						[4, 4]
					]),
					{ maxNodes: 3 }
				)
			).toBe(false);
			expect(visited).toBe(3);
		}
	);
	it.each([serverSafe, clientSafe])(
		'counts string map keys against the byte budget',
		(validate) => {
			expect(validate(new Map([['x'.repeat(1024), 0]]), { maxBytes: 16 })).toBe(false);
		}
	);
	it.each([serverSafe, clientSafe])(
		'stops a collection traversal at its node budget',
		(validate) => {
			let visited = 0;
			class CountedSet extends Set<number> {
				*[Symbol.iterator]() {
					for (const item of super.values()) {
						visited++;
						yield item;
					}
					return undefined;
				}
			}
			expect(
				validate(new CountedSet(Array.from({ length: 100 }, (_, i) => i)), { maxNodes: 4 })
			).toBe(false);
			expect(visited).toBeLessThanOrEqual(4);
		}
	);
});
