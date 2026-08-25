import { TaskContext, type Component } from '@exactjs/core';

/** A compiled leaf used to measure the generated continuation execution path. */
function PlannedLeaf(this: Component<{ value: number }>, props: { value: number }) {
	this.state.value = 0;
	function prepare(value: number, _task: TaskContext = TaskContext.server().parallel().blocking()) {
		this.state.value = value + 1;
	}
	prepare(props.value);
	return () => <li>{this.state.value}</li>;
}

/** Renders enough planned leaves to expose generated task and per-instance allocation costs. */
export function PlannedTree(this: Component<{}>, props: { count: number }) {
	return () => (
		<ul>
			{Array.from({ length: props.count }, (_, index) => (
				<PlannedLeaf key={String(index)} value={index} />
			))}
		</ul>
	);
}
