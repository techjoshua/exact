import type { ExactSourceEntity } from './contracts.js';

/**
 * Visits compiler source entities in depth-first authored order without native recursion.
 * Each entity is yielded before its children. Traversal uses O(tree depth) frame storage
 * and work proportional to the number of entities. Inputs are compiler-owned acyclic trees.
 */
export function* sourceEntities(
	entities: readonly ExactSourceEntity[]
): Generator<ExactSourceEntity, void, unknown> {
	const frames = [{ entities, index: 0 }];
	while (frames.length) {
		const frame = frames[frames.length - 1]!;
		if (frame.index >= frame.entities.length) {
			frames.pop();
			continue;
		}
		const entity = frame.entities[frame.index++]!;
		yield entity;
		if (entity.children.length) frames.push({ entities: entity.children, index: 0 });
	}
}
