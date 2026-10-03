/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes the enhancement namespace. */
import { TaskContext, type Component } from '@exactjs/core';
import { corpus } from '../scenarios/enhancement-routing.fixtures.js' with { type: 'exact-enhancement' };

/** Observations and controlled suspension belong to the test, not component state. */
export interface PendingOwnerProps {
	id: string;
	label?: string;
	enhanced: boolean;
	wait(signal: AbortSignal): Promise<void>;
	removed(id: string): void;
}

function writeLabel(record: { label: string }, label: string) {
	record.label = label;
}

function PendingOwner(
	this: Component<{ record: { label: string } }>,
	{ id, label = 'default', enhanced, wait, removed }: PendingOwnerProps
) {
	this.state.record = { label: 'idle' };
	this.onUnmount(() => removed(id));
	const run = async (
		input = label,
		task: TaskContext = TaskContext.client().latest().blocking()
	) => {
		writeLabel(this.state.record, input);
		await wait(task.signal);
		writeLabel(this.state.record, `${input}:done`);
	};
	return () => (
		<section data-pending-owner={id}>
			{enhanced ? (
				<button data-run corpus:tone={label} onClick={() => run()}>
					{label}
				</button>
			) : (
				<button data-run onClick={() => run()}>
					{label}
				</button>
			)}
			<output>{this.state.record.label}</output>
		</section>
	);
}

/** A stable key retains pending ownership across props, a new key releases it. */
export function pendingOwnerRoot(props: PendingOwnerProps) {
	return <PendingOwner key={props.id} {...props} />;
}
