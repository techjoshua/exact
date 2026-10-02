import { TaskContext as Policy, type Component } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';

class Values extends Array<number> {
	constructor() {
		super();
		Object.defineProperty(this, '0', {
			configurable: true,
			get() {
				throw new Error('Bookkeeping invoked indexed getter');
			},
			set: (value: number) => {
				this[1] = value;
			}
		});
	}
	static get [Symbol.species](): ArrayConstructor {
		throw new Error('Snapshot invoked subclass species');
	}
	override slice(start?: number, end?: number): number[] {
		void start;
		void end;
		throw new Error('Snapshot invoked authored slice');
	}
	#calls = 0;
	get calls() {
		return this.#calls;
	}
	get #callCount() {
		return this.#calls;
	}
	set #callCount(value: number) {
		this.#calls = value;
	}
	#record() {
		[this.#callCount] = [this.#callCount + 1];
	}
	#append = this.#makeAppend();
	#makeAppend() {
		return (value: number) => {
			this.#record();
			this.push(value);
			return this;
		};
	}
	append(value: number) {
		[super.length] = [this.length];
		return this.#append(value);
	}
}

// The shared helper retains argument identity and observes eager pending collection results.
function appendMutationInput(
	owner: { values: number[]; lookup: Map<string, number>; members: Set<number> },
	value: number
) {
	const source = {
		get input() {
			owner.lookup.set('value', value);
			return value;
		}
	};
	const input = { ...source }.input;
	[owner.values[0]] = [input];
	const length = owner.values.push(value);
	if (length !== owner.values.length) throw new Error('Array result and pending length disagree');
	if (owner.lookup.get('value') !== value) throw new Error('Map pending read disagrees');
	if (owner.members.add(value) !== owner.members || !owner.members.has(value))
		throw new Error('Set pending read or identity disagrees');
}

function makeMutationInput(
	owner: { values: number[]; lookup: Map<string, number>; members: Set<number> },
	value: number
) {
	class Factory {
		get append() {
			return () => appendMutationInput(owner, value);
		}
	}
	return new Factory().append;
}

/** Exercises authored mutations, suspension and task capture through retained component ownership. */
export function MutationContractProbe(
	this: Component<{
		count: number;
		values: number[];
		lookup: Map<string, number>;
		members: Set<number>;
		trace: string;
		receiver: Values | undefined;
	}>
) {
	this.state.count = 0;
	this.state.values = [];
	this.state.trace = '';
	this.state.receiver = undefined;
	this.state.lookup = new Map();
	this.state.members = new Set();
	const run = async (value: number = 1, task: Policy = Policy.client().latest().blocking()) => {
		void task;
		const read = () => this.state.count;
		const result = (this.state.count += await Promise.resolve(value));
		if (result !== read()) throw new Error('Task expression and pending read disagree');
		[this.state.values[0]] = [await Promise.resolve(read())];
		if (!this.state.receiver) this.state.receiver = new Values();
		this.state.receiver.append(this.state.count);
		this.state.receiver[0] = this.state.count;
		this.state.trace = `${this.state.receiver[1]}:${this.state.receiver.calls}`;
		let input = this.state.count;
		makeMutationInput(this.state, input)();
		input = -1;
	};
	return () => (
		<section data-mutation-contract>
			<button onClick={() => run()}>Next</button>
			<output>{this.state.trace}</output>
			<output data-mutation-inputs>
				{`${this.state.values.join(',')}:${this.state.lookup.get('value')}:${Array.from(this.state.members).join(',')}`}
			</output>
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
		this.state.values.push(this.state.count);
		this.state.trace = `${this.state.count}:${this.state.values.length}`;
	};
	void run();
	return () => <output data-server-mutation-contract>{this.state.trace}</output>;
}

/** Supplies the corpus root without relying on an application fixture. */
export function mutationContractRoot() {
	return createCompiledComponentReceipt(MutationContractProbe, {});
}
