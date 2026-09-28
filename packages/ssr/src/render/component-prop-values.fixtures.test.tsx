import { TaskContext, type Component } from '@exactjs/core';

/** Scalar props retain their values when a general JSX helper calls a direct server artifact.
 * @exact server
 */
export function ScalarProp(props: { value: unknown }) {
	return () => (
		<output>
			{typeof props.value}:{String(props.value)}:{props.value ? 'truthy' : 'falsy'}
		</output>
	);
}

/** Task-input props use the same expression boundary before scheduled work reads them.
 * @exact server
 */
export function ScheduledScalarProp(
	this: Component<{ value: unknown }>,
	props: { value: unknown }
) {
	this.state.value = undefined;
	const prepare = async (_task: TaskContext = TaskContext.server().blocking()) => {
		void _task;
		await Promise.resolve();
		this.state.value = props.value;
	};
	prepare();
	return () => (
		<output>
			{typeof this.state.value}:{String(this.state.value)}:{this.state.value ? 'truthy' : 'falsy'}
		</output>
	);
}
