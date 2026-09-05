import { TaskContext, type Component } from '@exactjs/core';

let cardMounts = 0;
let observedDisposals = 0;
let parallelStarts = 0;
let releaseParallelTasks: (() => void) | undefined;
let parallelTaskGate = Promise.resolve();

/** Resets observable lifecycle state owned by the compiled SSR fixtures. */
export function resetComponentRenderingFixtureState(): void {
	cardMounts = 0;
	observedDisposals = 0;
	parallelStarts = 0;
	parallelTaskGate = new Promise<void>((resolve) => {
		releaseParallelTasks = resolve;
	});
}

/** Returns how many compiler-issued sibling tasks began before the shared gate opened. */
export function readParallelTaskStarts(): number {
	return parallelStarts;
}

/** Releases every sibling task owned by the current concurrency fixture. */
export function settleParallelTasks(): void {
	releaseParallelTasks?.();
	releaseParallelTasks = undefined;
}

/** Returns lifecycle state without exposing component instances to the test. */
export function readComponentRenderingFixtureState(): {
	cardMounts: number;
	observedDisposals: number;
} {
	return { cardMounts, observedDisposals };
}

/** Compiled component proving that SSR does not run client mount lifecycle. */
export function ServerCard(this: Component<{ title: string }>, props: { title: string }) {
	this.state.title = props.title;
	this.onMount(() => cardMounts++);
	return () => <article>{this.state.title}</article>;
}

/** Compiled component with blocking setup work and owned teardown. */
export function ObservedServerComponent(this: Component<{ value: number }>) {
	this.state.value = 1;
	const settle = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await Promise.resolve();
		this.state.value++;
	};
	settle();
	this.onUnmount(() => observedDisposals++);
	return () => <p>{this.state.value}</p>;
}

/** Synchronous companion used to verify teardown without scheduled work. */
export function SynchronousObservedServerComponent(this: Component<{ value: number }>) {
	this.state.value = 1;
	this.onUnmount(() => observedDisposals++);
	return () => <p>{this.state.value}</p>;
}

/** Compiled component whose blocking task publishes settled server state. */
export function ProfileComponent(this: Component<{ name: string }>) {
	this.state.name = 'Loading';
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await Promise.resolve();
		this.state.name = 'Ada';
	};
	load();
	return () => <p>{this.state.name}</p>;
}

function SettledChild(this: Component<{ label: string }>) {
	this.state.label = 'Loading';
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await Promise.resolve();
		this.state.label = 'Ready';
	};
	load();
	return () => <strong>{this.state.label}</strong>;
}

/** Compiled parent/child fixture proving nested task settlement. */
export function ParentWithSettledChild() {
	return () => (
		<section>
			<SettledChild />
		</section>
	);
}

function ParallelSettledChild(this: Component<{ ready: boolean }>, props: { index: number }) {
	this.state.ready = false;
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		parallelStarts++;
		await parallelTaskGate;
		this.state.ready = true;
	};
	load();
	return () => <strong>{this.state.ready ? `Ready ${props.index}` : 'Waiting'}</strong>;
}

/** Compiled root proving scheduled siblings are issued before ordered serialization. */
export function ParallelSettledSiblings() {
	return () => (
		<section>
			<ParallelSettledChild index={1} />
			<ParallelSettledChild index={2} />
			<ParallelSettledChild index={3} />
		</section>
	);
}
