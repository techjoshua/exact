import { expect, it } from 'vitest';
import { planConfigurationContributors } from './configuration-ordering.js';
import type { ExactConfigurationContributor } from './discovery.js';

/** Supplies package identities without involving resolution or module loading in a graph algorithm. */
function contributor(id: string): ExactConfigurationContributor {
	return {
		plugin: '@exactjs/example',
		node: {
			id,
			location: '/unused',
			realPath: '/unused',
			manifest: { name: id, version: '1.0.0' },
			dependencies: new Map()
		},
		declaration: { subpath: './config', export: 'configure' }
	};
}

it('preserves sorted execution batches and transitive provenance through noncontributing packages', () => {
	const contributors = ['b-parent', 'c-peer', 'a-leaf', 'z-free', 'd-root'].map(contributor);
	const participantEdges = new Map<string, ReadonlySet<string>>([
		['b-parent', new Set(['bridge'])],
		['bridge', new Set(['a-leaf'])],
		['c-peer', new Set(['a-leaf'])],
		['d-root', new Set(['b-parent', 'c-peer'])]
	]);
	const plan = planConfigurationContributors({ participantEdges }, contributors);
	expect(plan.ordered.map((value) => value.node.id)).toEqual([
		'a-leaf',
		'z-free',
		'b-parent',
		'c-peer',
		'd-root'
	]);
	expect(plan.orderingAfter.get('d-root')).toEqual(['a-leaf', 'b-parent', 'c-peer']);
	expect(plan.orderingAfter.get('b-parent')).toEqual(['a-leaf']);
	expect(plan.orderingAfter.get('z-free')).toEqual([]);
});

it('rejects contributor cycles through intermediary packages and handles an empty contributor set', () => {
	const participantEdges = new Map<string, ReadonlySet<string>>([
		['a', new Set(['bridge'])],
		['bridge', new Set(['b'])],
		['b', new Set(['a'])]
	]);
	expect(() =>
		planConfigurationContributors({ participantEdges }, ['a', 'b', 'free'].map(contributor))
	).toThrow('cycle');
	expect(planConfigurationContributors({ participantEdges }, []).ordered).toEqual([]);
});

it('bounds graph reads when many contributors form a chain', () => {
	let reads = 0;
	class Edges extends Map<string, ReadonlySet<string>> {
		override get(id: string) {
			reads++;
			return super.get(id);
		}
	}
	const count = 24;
	const contributors = Array.from({ length: count }, (_, index) =>
		contributor('node-' + String(index).padStart(2, '0'))
	);
	const participantEdges = new Edges(
		contributors
			.slice(0, -1)
			.map((value, index) => [value.node.id, new Set([contributors[index + 1]!.node.id])])
	);
	const plan = planConfigurationContributors({ participantEdges }, contributors);
	expect(plan.ordered.map((value) => value.node.id)).toEqual(
		contributors.map((value) => value.node.id).reverse()
	);
	expect(reads).toBeLessThanOrEqual(count * count);
});
