import {
	activateTaskForHost,
	createVNode,
	defineTask,
	exactComponentContract,
	exactComponentType,
	markComponentContinuationTask,
	type Component,
	type TaskContext
} from '@exactjs/core';

/** A manually branded leaf used to measure the compiled continuation execution path. */
function PlannedLeaf(this: Component<{ value: number }>, props: { value: number }) {
	this.state.value = 0;
	const prepare = defineTask(
		{ readiness: 'blocking' },
		markComponentContinuationTask(
			'performance-planned-task',
			(value: number, _task: TaskContext) => {
				this.state.value = value + 1;
			}
		)
	);
	activateTaskForHost(this, prepare, props.value);
	return () => createVNode('li', null, this.state.value);
}

Object.assign(PlannedLeaf, {
	[exactComponentType]: 'performance:PlannedLeaf',
	[exactComponentContract]: {
		version: 2 as const,
		placement: 'isomorphic' as const,
		role: 'executor' as const,
		implementations: [],
		continuations: [],
		executors: [],
		boundaries: [],
		execution: {
			version: 1 as const,
			ports: [
				{ index: 0, kind: 'props' as const, path: 'value', direction: 'input' as const },
				{ index: 1, kind: 'state' as const, path: 'value', direction: 'output' as const }
			],
			transitions: [
				{
					id: 'performance-planned-task',
					taskId: 'performance-planned-task',
					activation: 'setup' as const,
					placement: 'isomorphic' as const,
					readiness: 'blocking' as const,
					concurrency: 'parallel' as const,
					inputs: [0],
					outputs: [1]
				}
			],
			reactive: []
		}
	}
});

function PlannedTreeImplementation(this: Component<{}>, props: { count: number }) {
	const children = Array.from({ length: props.count }, (_, index) =>
		createVNode(PlannedLeaf, { key: String(index), value: index })
	);
	return () => createVNode('ul', null, ...children);
}

/** Renders enough planned leaves to expose root-plan cache and per-instance allocation costs. */
export const PlannedTree = Object.assign(PlannedTreeImplementation, {
	[exactComponentType]: 'performance:PlannedTree',
	[exactComponentContract]: {
		version: 2 as const,
		placement: 'isomorphic' as const,
		role: 'executor' as const,
		implementations: [],
		continuations: [],
		executors: [],
		boundaries: [],
		execution: { version: 1 as const, ports: [], transitions: [], reactive: [] }
	}
});
