import { TaskContext, type Component } from '@exactjs/core';

type Row = { /** @exact key */ id: number; label: string };

function Counter(this: Component<{ count: number; rows: Row[] }>) {
	this.state.count = 0;
	this.state.rows = [
		{ id: 1, label: 'one' },
		{ id: 2, label: 'two' }
	];
	this.onUnmount(() => {
		(globalThis as unknown as { exactAbiDisposals: number }).exactAbiDisposals++;
	});
	const increment = (_task: TaskContext = TaskContext.client()) => {
		this.state.count++;
	};
	return () => (
		<section>
			<button id="increment" onClick={() => increment()}>
				Count {this.state.count}
			</button>
			<button id="reverse" onClick={() => this.state.rows.reverse()}>
				Reverse
			</button>
			{this.state.count > 0 && <strong id="positive">positive</strong>}
			<ul>
				{this.state.rows.map((row) => (
					<li data-id={row.id}>{row.label}</li>
				))}
			</ul>
		</section>
	);
}

/** Supplies a compiler-branded root operation from the preserved baseline component. */
export function view() {
	return <Counter />;
}
