import { TaskContext, type Component } from '@exactjs/core';

/** Compiled fixture with inspectable state and host styling. */
export function Card(this: Component<{ label?: string }>) {
	this.state.label = 'Ready';
	return () => (
		<article id="card" style="outline: 1px solid red">
			{this.state.label}
		</article>
	);
}

/** Compiled fixture mounted after a DevTools connection is established. */
export function LateRoot(this: Component<{ label?: string }>) {
	this.state.label = 'Mounted after connect';
	return () => <p id="late-root">{this.state.label}</p>;
}

/** Compiled fixture carrying a redaction-sensitive profile value. */
export function Account(
	this: Component<{ profile?: { token: string; name: string } }>,
	props: {
		name: string;
		token: string;
	}
) {
	this.state.profile = { token: props.token, name: props.name };
	return () => <p>{this.state.profile!.name}</p>;
}

/** Compiled fixture exposing task and state inspection. */
export function Counter(this: Component<{ count?: number }>) {
	this.state.count = 1;
	const load = async (_task: TaskContext = TaskContext.client()) => {
		void _task;
		return Promise.resolve();
	};
	const increment = (_task: TaskContext = TaskContext.client()) => {
		void _task;
	};
	void load();
	increment();
	return () => <button id="counter">{this.state.count}</button>;
}

/** Issues the compiled card fixture operation. */
export const cardRoot = () => <Card />;
/** Issues the compiled late-root fixture operation. */
export const lateRoot = () => <LateRoot />;
/** Issues the compiled account fixture operation. */
export const accountRoot = (name: string, token: string) => <Account name={name} token={token} />;
/** Issues the compiled counter fixture operation. */
export const counterRoot = () => <Counter />;
