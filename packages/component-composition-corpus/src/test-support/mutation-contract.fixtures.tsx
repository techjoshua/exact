import { TaskContext as Policy, type Component } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';

function appendReceiver(owner: { values: number[]; calls: number }, value: number) {
	owner.calls++;
	owner.values['push'](value);
}

// The shared helper retains argument identity and observes eager pending collection results.
function appendMutationInput(
	owner: { values: number[]; lookup: Map<string, number>; members: Set<number> },
	value: number
) {
	const source = {
		get input() {
			owner.lookup['set']('value', value);
			return value;
		}
	};
	const input = { ...source }.input;
	[owner.values[0]] = [input];
	const length = owner.values['push'](value);
	if (length !== owner.values.length) throw new Error('Array result and pending length disagree');
	if (owner.lookup.get('value') !== value) throw new Error('Map pending read disagrees');
	if (owner.members['add'](value) !== owner.members || !owner.members.has(value))
		throw new Error('Set pending read or identity disagrees');
}

/** @exact state-view */
function makeMutationInput(
	owner: { values: number[]; lookup: Map<string, number>; members: Set<number> },
	value: number
) {
	return () => appendMutationInput(owner, value);
}

/** Exercises authored mutations, suspension and task capture through retained component ownership. */
export function MutationContractProbe(
	this: Component<{
		count: number;
		values: number[];
		lookup: Map<string, number>;
		members: Set<number>;
		trace: string;
		keyTrace: string;
		missing?: { n: number };
		missingRows?: number[];
		receiver: { values: number[]; calls: number } | undefined;
	}>
) {
	this.state.count = 0;
	this.state.values = [];
	this.state.trace = '';
	this.state.keyTrace = '';
	this.state.receiver = undefined;
	this.state.lookup = new Map();
	this.state.members = new Set();
	const run = async (value: number = 1, task: Policy = Policy.client().latest().blocking()) => {
		void task;
		const read = () => this.state.count;
		const result = (this.state.count += await Promise.resolve(value));
		if (result !== read()) throw new Error('Task expression and pending read disagree');
		[this.state.values[0]] = [await Promise.resolve(read())];
		if (!this.state.receiver) this.state.receiver = { values: [], calls: 0 };
		appendReceiver(this.state.receiver, this.state.count);
		this.state.receiver.values[1] = this.state.count;
		this.state.trace = `${this.state.receiver.values[1]}:${this.state.receiver.calls}`;
		let input = this.state.count;
		makeMutationInput(this.state, input)();
		input = -1;
		this.state.keyTrace = '';
		this.state.lookup[((this.state.keyTrace += 'key'), 'set' as const)](
			'value',
			((this.state.keyTrace += 'args'), read())
		);
		this.state.keyTrace += 'after';
		await Promise.resolve();
		this.state.keyTrace += 'done';
	};
	const booleanLabel = this.state.members.has(1).toString();
	const valuesLabel = Array.from(this.state.lookup['values']()).join(',');
	return () => (
		<section data-mutation-contract>
			<button
				onClick={() => {
					const count = this.state.count;
					const { trace, ...copy } = this.state;
					void trace;
					copy.count++;
					const [first, ...tail] = this.state.values;
					void first;
					tail.push(999);
					const { missing = { n: 4 } } = this.state;
					missing.n++;
					const { missingRows = [] } = this.state;
					if (missingRows.push(9) !== 1)
						throw new Error('Default array lost its selected receiver');
					const { lookup = new Map<string, number>(), members = new Set<number>() } = this.state;
					if (lookup['delete']('absent') || members['delete'](-1))
						throw new Error('Default collection lost its selected receiver');
					if (
						this.state.count !== count ||
						this.state.values.includes(999) ||
						this.state.missing !== undefined ||
						this.state.missingRows !== undefined
					)
						throw new Error('Allocated binding changed component state');
					void run();
				}}
			>
				Next
			</button>
			<output>{this.state.trace}</output>
			<output data-mutation-inputs>
				{`${this.state.values.join(',')}:${this.state.lookup.get('value')}:${Array.from(this.state.members).join(',')}`}
			</output>
			<output data-mutation-key-order>{this.state.keyTrace}</output>
			<output data-mutation-derived>{booleanLabel + ':' + valuesLabel}</output>
		</section>
	);
}

/** Verifies that direct SSR resolves captures before ordered task-local state reads. */
export function ServerMutationContractProbe(
	this: Component<{ count: number; trace: string; values: number[] }>
) {
	this.state.count = 0;
	this.state.trace = '';
	this.state.values = [];
	const seed = async (task: Policy = Policy.server().latest().blocking()) => {
		void task;
		this.state.count = await Promise.resolve(5);
	};
	void seed();
	const run = async (
		{ value }: { value: number } = { value: 5 },
		task: Policy = Policy.server().latest().blocking()
	) => {
		void task;
		function read(this: { state: { value: number } }) {
			return this.state.value;
		}
		class Reader {
			state = { value };
			read = () => this.state.value;
		}
		const owner = this;
		if (read.call({ state: { value: new Reader().read() } }) < 0) owner.state.count = value;
		this.state.values['push'](this.state.count);
		this.state.trace = `${this.state.count}:${this.state.values.length}`;
	};
	void run();
	return () => <output data-server-mutation-contract>{this.state.trace}</output>;
}

/** Supplies the corpus root without relying on an application fixture. */
export function mutationContractRoot() {
	return createCompiledComponentReceipt(MutationContractProbe, {});
}
