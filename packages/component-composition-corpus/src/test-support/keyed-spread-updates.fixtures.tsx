import { peek, type Component } from '@exactjs/core';

/** A durable row whose source object can change without changing its key. */
export type SpreadRow = { id: string; status: string; title?: string };
/** Equivalent live inputs and an intentional snapshot control. */
export type SpreadPath =
	| 'spread'
	| 'copy'
	| 'ordered'
	| 'explicit'
	| 'snapshot'
	| 'conditional-empty'
	| 'short-circuit';
const removed: string[] = [];
function Row(this: Component<{}>, props: SpreadRow) {
	this.onUnmount(() => removed.push(props.id));
	return () => (
		<li data-row={props.id} data-status={props.status} title={props.title}>
			<input aria-label={props.id} />
			{props.status}
		</li>
	);
}
/** Exercises live state-owned rows and deliberately copied snapshots. */
export function KeyedSpreadWorkbench(
	this: Component<{ rows: SpreadRow[] }>,
	props: { path: SpreadPath }
) {
	this.state.rows = [
		{ id: 'a', status: 'pending', title: 'Initial' },
		{ id: 'b', status: 'pending' }
	];
	const snapshot = peek(() => this.state.rows.map((row) => ({ ...row })));
	return () => (
		<section data-keyed-spreads>
			<button
				onClick={() => {
					this.state.rows[0] = { id: 'a', status: 'running' };
				}}
			>
				Start
			</button>
			<button
				onClick={() => {
					this.state.rows = this.state.rows.map((row) => ({ ...row, status: 'done' }));
				}}
			>
				Finish
			</button>
			<button
				onClick={() => {
					this.state.rows[0].status = 'retried';
				}}
			>
				Retry
			</button>
			<button
				onClick={() => {
					this.state.rows.reverse();
				}}
			>
				Reverse
			</button>
			<button
				onClick={() => {
					this.state.rows = [];
				}}
			>
				Clear
			</button>
			<ol>
				{props.path === 'conditional-empty'
					? this.state.rows.length
						? this.state.rows.map((row) => <Row key={row.id} {...row} />)
						: null
					: props.path === 'short-circuit'
						? this.state.rows.length > 0 &&
							this.state.rows.map((row) => <Row key={row.id} {...row} />)
						: props.path === 'snapshot'
							? snapshot.map((row) => <Row key={row.id} {...row} />)
							: props.path === 'explicit'
								? this.state.rows.map((row) => (
										<Row key={row.id} id={row.id} status={row.status} title={row.title} />
									))
								: props.path === 'copy'
									? this.state.rows.map((row) => <Row key={row.id} {...{ ...row }} />)
									: props.path === 'ordered'
										? this.state.rows.map((row) => (
												<Row
													key={row.id}
													{...row}
													{...{ status: row.status + '!' }}
													title="Override"
												/>
											))
										: this.state.rows.map((row) => <Row key={row.id} {...row} />)}
			</ol>
		</section>
	);
}
/** Creates an independent example of state-owned keyed prop spreads. */
export function keyedSpreadRoot(path: SpreadPath) {
	return <KeyedSpreadWorkbench path={path} />;
}
/** Reads row cleanup observations. */
export function removedSpreadRows() {
	return [...removed];
}
/** Clears cleanup observations between tests. */
export function resetSpreadRows() {
	removed.length = 0;
}

/** Keeps a setup snapshot independent while chained derived output follows its owning state. */
export function DerivedStateIsland(this: Component<{ count: number }>) {
	this.state.count = 0;
	const initial = peek(() => this.state.count);
	const label = `Value ${this.state.count}`;
	const message = `${label}!`;
	return () => (
		<section data-derived-state>
			<button onClick={() => this.state.count++}>Increment derived</button>
			<output>{message}</output>
			<small>{initial}</small>
		</section>
	);
}
/** Creates the setup-derived state ownership control. */
export function derivedStateRoot() {
	return <DerivedStateIsland />;
}
