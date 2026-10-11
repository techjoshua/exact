import { createContext, TaskContext, type Component } from '@exactjs/core';
/** Shared inherited name used by the compiled client fixture. */
export const Name = createContext<string>('test.name');
/** Compiled context consumer. */
export function Child(this: Component<{}>) {
	const name = this.getContext(Name);
	return () => <span>{name}</span>;
}
/** Compiled reactive counter used for event and direct state updates. */
export function Counter(this: Component<{ count: number }>, props: { initial: number }) {
	this.state.count = props.initial;
	return () => (
		<section>
			<button onClick={() => this.state.count++}>Count {this.state.count}</button>
			<Child />
		</section>
	);
}
/** Compiled setup-owned asynchronous task. */
export function AsyncPanel(this: Component<{ ready: boolean }>) {
	this.state.ready = false;
	const load = async (_task: TaskContext = TaskContext.client().blocking()) => {
		await Promise.resolve();
		this.state.ready = true;
	};
	load();
	return () => <p>{this.state.ready ? 'Ready' : 'Waiting'}</p>;
}
/** Compiled conditional range used to verify stale element handles. */
export function Existing(this: Component<{ alternate: boolean }>) {
	this.state.alternate = false;
	return () => (this.state.alternate ? <span>New</span> : <button>Old</button>);
}

const AliasContext = createContext<{ increment(): void; release(): void }>('test.alias-owner');
/** Records cleanup of the child that invokes its parent's captured state callbacks. */
export const aliasCleanup = { count: 0 };
/** Publishes ordinary object methods backed by a durable component alias. */
export function AliasContextCounter(this: Component<{ count: number }>) {
	this.state.count = 0;
	const owner = this;
	const callbacks = {
		increment() {
			owner.state.count++;
		},
		release() {
			owner.state.count += 2;
			aliasCleanup.count++;
		}
	};
	this.setContext(AliasContext, callbacks);
	return () => (
		<section>
			<output>{this.state.count}</output>
			<AliasContextChild />
		</section>
	);
}
/** Invokes parent-owned callbacks during mounting, repeated events, and cleanup. */
export function AliasContextChild(this: Component<{}>) {
	const callbacks = this.getContext(AliasContext);
	this.onMount(() => callbacks.increment());
	this.onUnmount(() => callbacks.release());
	return () => <button onClick={() => callbacks.increment()}>Increment</button>;
}
