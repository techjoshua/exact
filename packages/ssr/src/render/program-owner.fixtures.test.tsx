import { createContext, TaskContext, type Component } from '@exactjs/core';

const OwnerName = createContext<string>('ssr.program-owner', { reactive: false });
let started: string[] = [];
let disposed: string[] = [];

/** Isolates acquisition and cleanup observations for one concurrent rendering test. */
export function resetProgramOwners() {
	started = [];
	disposed = [];
}

/** Returns snapshots so the test cannot mutate fixture ownership records. */
export function readProgramOwners() {
	return { started: [...started], disposed: [...disposed] };
}

function OwnerValue(this: Component<{ value: string }>) {
	const name = this.getContext(OwnerName);
	started.push(name);
	this.onUnmount(() => {
		disposed.push(name);
	});
	this.state.value = 'pending';
	const prepare = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await Promise.resolve();
		this.state.value = name;
	};
	prepare();
	return () => <span>{this.state.value}</span>;
}

function NestedOwner(this: Component<{}>, props: { name: string }) {
	this.setContext(OwnerName, props.name);
	return () => <OwnerValue />;
}

/** A parent resumes its own child traversal after a nested provider has rendered. */
export function ProgramOwnerTree(this: Component<{}>, props: { name: string }) {
	this.setContext(OwnerName, props.name);
	return () => (
		<section>
			<OwnerValue />
			<NestedOwner name={`${props.name}:nested`} />
			<OwnerValue />
		</section>
	);
}
