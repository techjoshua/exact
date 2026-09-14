import { TaskContext, type Component } from '@exactjs/core';
import { ApplicationName, RequestName, Theme } from './server-contexts.fixtures.test.js';
/** Nested component that captures all context scopes. */
export function Child(this: Component<{ summary: string }>) {
	this.state.summary = `${this.getContext(ApplicationName)}:${this.getContext(RequestName)}:${this.getContext(Theme)}`;
	return () => <span>{this.state.summary}</span>;
}
/** Scheduled server parent with settled state and inherited context. */
export function Page(this: Component<{ ready: boolean }>, props: { label: string }) {
	this.state.ready = false;
	this.setContext(Theme, 'dark');
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		await Promise.resolve();
		this.state.ready = true;
	};
	load();
	return () => (
		<main>
			{props.label}
			{this.state.ready ? <Child /> : null}
		</main>
	);
}
/** Server-only markup describing an explicit client island for protocol tests. */
export function ServerPage() {
	return () => (
		<div
			data-exact-client-boundary="island-opaque"
			data-exact-client-name="ClientIsland"
			data-exact-client-props={JSON.stringify({ props: {} })}
		/>
	);
}
/** Stateless root used for resumption and observer coverage. */
export function ReadyPage() {
	return () => <main>Ready</main>;
}
/** Stateless intermediate preserves logical topology when observation is requested. */
export function Group() {
	return () => (
		<section>
			<Leaf label="One" />
			<Leaf label="Two" />
		</section>
	);
}
/** Repeated component identity must still produce distinct captured instances. */
export function Leaf(this: Component<{ label: string }>, props: { label: string }) {
	this.state.label = props.label;
	return () => <b>{this.state.label}</b>;
}
/** Stateless nested root exercises logical parent and preorder reporting. */
export function Tree() {
	return () => (
		<article>
			<Group />
		</article>
	);
}

let disposals = 0;
/** Reports cleanup across successful and failed observed renders. */
export function disposalCount() {
	return disposals;
}
function content(fail: boolean) {
	if (fail) throw new Error('fixture render failure');
	return 'Ready';
}
/** Disposal mutations cannot change a settled test snapshot. */
export function Cleanup(this: Component<{ value: string }>, props: { fail: boolean }) {
	this.state.value = 'Ready';
	this.onUnmount(() => {
		disposals++;
		this.state.value = 'Disposed';
	});
	return () => <p>{content(props.fail)}</p>;
}
