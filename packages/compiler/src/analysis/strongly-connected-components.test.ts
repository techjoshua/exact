import { describe, expect, it } from 'vitest';
import { orderStronglyConnectedComponents } from './strongly-connected-components.js';

type Node = { id: string; dependencies: string[] };

describe('strongly connected component ordering', () => {
	it('places dependencies before consumers and groups cycles deterministically', () => {
		const nodes: Node[] = [
			{ id: 'consumer', dependencies: ['cycle-b'] },
			{ id: 'cycle-b', dependencies: ['cycle-a'] },
			{ id: 'cycle-a', dependencies: ['cycle-b'] }
		];

		const result = orderStronglyConnectedComponents(
			nodes,
			(node) => node.id,
			(node) => node.dependencies
		);

		expect(result.map((component) => component.map((node) => node.id))).toEqual([
			['cycle-a', 'cycle-b'],
			['consumer']
		]);
	});

	it('ignores dependencies outside the analyzed graph', () => {
		const node = { id: 'local', dependencies: ['external'] };
		expect(
			orderStronglyConnectedComponents(
				[node],
				(candidate) => candidate.id,
				(candidate) => candidate.dependencies
			)
		).toEqual([[node]]);
	});
});
