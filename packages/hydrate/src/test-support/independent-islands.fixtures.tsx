import { TaskContext, type Component } from '@exactjs/core';

/** Resumes a server-set value and then mutates it through its durable client instance. */
export function IndependentCounter(this: Component<{ count: number }>, props: { initial: number }) {
	this.state.count = props.initial;
	const prepare = (_task: TaskContext = TaskContext.server().blocking()) => {
		void _task;
		this.state.count = props.initial + 10;
	};
	prepare();
	return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
}

function IslandPage(this: Component<{ initial: number }>) {
	const prepare = (_task: TaskContext = TaskContext.server().blocking()) => {
		void _task;
		this.state.initial = 2;
	};
	prepare();
	return () => (
		<main>
			<IndependentCounter initial={this.state.initial} />
			<IndependentCounter initial={7} />
		</main>
	);
}

/** A server-owned page with two independently activated copies of one client component. */
export const islandPage = <IslandPage />;

/** Exercises both compact input reconstruction and computations with several prop dependencies. */
function PropValues(
	this: Component<{ simple: number; combined: number }>,
	props: { initial: number; offset: number }
) {
	this.state.simple = props.initial;
	this.state.combined = props.initial + props.offset;
	return () => (
		<output>
			{this.state.simple}:{this.state.combined}
		</output>
	);
}

function PropPage(this: Component<{ initial: number }>) {
	this.state.initial = 2;
	return () => (
		<section>
			<button onClick={() => (this.state.initial = 5)}>Change</button>
			<PropValues initial={this.state.initial} offset={3} />
		</section>
	);
}

/** A resumable root whose child must preserve sparse setup and later parent input updates. */
export const propPage = <PropPage />;
