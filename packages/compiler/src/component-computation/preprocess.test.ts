import { describe, expect, it } from 'vitest';
import { transform, transformSource } from '../index.js';

describe('@exactjs/compiler component computations', () => {
	it('keeps nullish component-state initialization in setup', () => {
		const output = transform(
			`function Greeting(this: Component<{ name: string }>, props: { initial?: string }) {
				this.state.name ??= props.initial ?? '';
				return () => <p>{this.state.name}</p>;
			}`
		);

		expect(output).toContain('__exactUpdate(this.state, ["name"]');
		expect(output).not.toContain('this.task(');
	});

	it('lowers synchronous derived state assignments into owned reactive computations', () => {
		const output = transform(
			`function Summary(this: Component<{ quantity: number; price: number; subtotal: number }>) {
				this.state.subtotal = this.state.quantity * this.state.price;
				return () => <output>{this.state.subtotal}</output>;
			}`,
			{ filename: 'Summary.tsx' }
		);
		expect(output).toContain('__exactActivateTask(this, __exactDefineTask({');
		expect(output).toContain('this.reactive(() => this.state.quantity)');
		expect(output).toContain('this.reactive(() => this.state.price)');
		expect(output).toContain('__exactWrite(this.state, ["subtotal"]');
	});

	it('keeps dependency-free state initialization synchronous and unowned', () => {
		const output = transform(
			`function Counter(this: Component<{ count: number }>) {
				this.state.count = 0;
				return () => <output>{this.state.count}</output>;
			}`,
			{ filename: 'Counter.tsx' }
		);
		expect(output).not.toContain('this.task(');
		expect(output).toContain('__exactWrite(this.state, ["count"], () => 0)');
	});

	it('owns environment-specific state production even without reactive inputs', () => {
		const result = transformSource(
			`function Width(this: Component<{ value: number }>) {
				this.state.value = window.innerWidth;
				return () => <output>{this.state.value}</output>;
			}`,
			{ filename: 'Width.tsx' }
		);
		expect(result.code).toContain('__exactActivateTask(this, __exactDefineTask({');
		expect(result.code).toContain('__exactWrite(this.state, ["value"]');
		expect(result.manifest.components[0]?.tasks[0]?.placement).toBe('client');
	});

	it('keeps peeked setup assignments as one-time snapshots', () => {
		const output = transform(
			`function Editor(this: Component<{ initial: string }>, props: { value: string }) {
				this.state.initial = peek(() => props.value);
				return () => <output>{this.state.initial}</output>;
			}`,
			{ filename: 'Editor.tsx' }
		);
		expect(output).not.toContain('this.task(');
		expect(output).toContain('peek(() => props.value)');
	});

	it('rejects direct and distributed reactive assignment cycles', () => {
		expect(() =>
			transform(
				`function Counter(this: Component<{ count: number }>) {
					this.state.count = this.state.count + 1;
					return () => <output>{this.state.count}</output>;
				}`,
				{ filename: 'Counter.tsx' }
			)
		).toThrow(/reactive.*cycle/);
		expect(() =>
			transform(
				`function Cycle(this: Component<{ first: number; second: number }>) {
					this.state.first = this.state.second + 1;
					this.state.second = this.state.first + 1;
					return () => <output>{this.state.first}</output>;
				}`,
				{ filename: 'Cycle.tsx' }
			)
		).toThrow('creates a reactive dependency cycle');
	});

	it('publishes array and object derived destructuring through state write helpers', () => {
		const arrayOutput = transform(
			`function Totals(this: Component<{ values: number[]; subtotal: number; tax: number }>) {
				[this.state.subtotal, this.state.tax] = this.state.values;
				return () => <output>{this.state.subtotal}</output>;
			}`,
			{ filename: 'ArrayTotals.tsx' }
		);
		expect(arrayOutput).toContain('__exactWrite(this.state, ["subtotal"]');
		expect(arrayOutput).toContain('__exactWrite(this.state, ["tax"]');
		const objectOutput = transform(
			`function Totals(this: Component<{ values: { subtotal: number; tax: number }; subtotal: number; tax: number }>) {
				({ subtotal: this.state.subtotal, tax: this.state.tax } = this.state.values);
				return () => <output>{this.state.tax}</output>;
			}`,
			{ filename: 'ObjectTotals.tsx' }
		);
		expect(objectOutput).toContain('__exactWrite(this.state, ["subtotal"]');
		expect(objectOutput).toContain('__exactWrite(this.state, ["tax"]');
	});

	it('preserves rest and computed-key semantics while publishing derived destructuring', () => {
		const output = transform(
			`function Selection(this: Component<{
				index: number;
				values: number[];
				selected: number;
				remaining: number[];
				record: Record<string, number>;
				key: string;
				match: number;
				others: Record<string, number>;
			}>) {
				[this.state.selected = 10, ...this.state.remaining] = this.state.values;
				({
					[this.state.key]: this.state.match = 20,
					...this.state.others
				} = this.state.record);
				return () => <output>{this.state.match}</output>;
			}`,
			{ filename: 'Selection.tsx' }
		);

		expect(output).toContain('const [__exactDestructured_');
		expect(output).toContain('...__exactDestructured_');
		expect(output).toContain('= 10');
		expect(output).toContain('= 20');
		expect(output).toMatch(/\[__exactDependency\d*\]: __exactDestructured_/);
		expect(output).toContain('__exactWrite(this.state, ["remaining"]');
		expect(output).toContain('__exactWrite(this.state, ["others"]');
	});

	it('preserves synchronous try catch finally as one reactive computation region', () => {
		const output = transform(
			`declare function calculate(value: number): number;
			function Summary(this: Component<{ input: number; result: number; error?: string; attempted: boolean }>) {
				try {
					this.state.result = calculate(this.state.input);
				} catch (error) {
					this.state.error = String(error);
				} finally {
					this.state.attempted = true;
				}
				return () => <output>{this.state.result}</output>;
			}`,
			{ filename: 'TrySummary.tsx' }
		);
		expect(output).toContain('__exactActivateTask(this, __exactDefineTask({');
		expect(output).toContain('this.reactive(() => this.state.input)');
		expect(output).toContain('try {');
		expect(output).toContain('catch (error)');
		expect(output).toContain('finally');
		expect(output).toContain('__exactWrite(this.state, ["result"]');
		expect(output).toContain('__exactWrite(this.state, ["error"]');
		expect(output).toContain('__exactWrite(this.state, ["attempted"]');
	});

	it('lowers sequential async component control flow and preserves try catch finally', () => {
		const output = transform(
			`declare function load(id: string): Promise<string>;
			declare function loadOrders(customer: string): Promise<string[]>;
			function describe(error: unknown): string { return String(error); }
			async function Customer(this: Component<{ id: string; value?: string; orders: string[]; error?: string; loading: boolean }>) {
				try {
					const value = await load(this.state.id);
					const orders = await loadOrders(value);
					[this.state.value, this.state.orders] = [value, orders];
				} catch (error) {
					this.state.error = describe(error);
				} finally {
					this.state.loading = false;
				}
				return () => <output>{this.state.value}</output>;
			}`,
			{ filename: 'Customer.tsx' }
		);
		expect(output).not.toContain('async function Customer');
		expect(output).toContain('__exactActivateTask(this, __exactDefineTask({');
		expect(output).toContain('readiness: "blocking"');
		expect(output).toContain('if (__exactComponentSignal.aborted)');
		expect(output).toContain('try {');
		expect(output).toContain('catch (error)');
		expect(output).toContain('finally');
		expect(output).toContain('__exactTaskAwait');
		expect(output).toContain('__exactStageTaskMutation');
		expect(output.match(/__exactTaskAwait/g)?.length).toBeGreaterThanOrEqual(2);
	});

	it('keeps synchronous initialization ahead of an async generation', () => {
		const output = transform(
			`declare function load(id: string): Promise<string>;
			async function Customer(this: Component<{ id: string; value?: string }>) {
				this.state.id = "initial";
				this.state.value = await load(this.state.id);
				return () => <output>{this.state.value}</output>;
			}`,
			{ filename: 'InitializedAsync.tsx' }
		);
		const initialization = output.indexOf('__exactWrite(this.state, ["id"], () => "initial")');
		const task = output.indexOf('__exactActivateTask(this, __exactDefineTask({');
		expect(initialization).toBeGreaterThanOrEqual(0);
		expect(task).toBeGreaterThan(initialization);
		expect(output).toContain('this.reactive(() => this.state.id)');
	});

	it('rejects escaping async locals and async feedback cycles', () => {
		expect(() =>
			transform(
				`declare function load(): Promise<string>;
				async function Customer(this: Component<{}>) {
					const customer = await load();
					return () => <output>{customer}</output>;
				}`,
				{ filename: 'EscapingAsyncLocal.tsx' }
			)
		).toThrow('assign the value to this.state instead');
		expect(() =>
			transform(
				`declare function next(value: number): Promise<number>;
				async function Counter(this: Component<{ count: number }>) {
					this.state.count = await next(this.state.count);
					return () => <output>{this.state.count}</output>;
				}`,
				{ filename: 'AsyncCycle.tsx' }
			)
		).toThrow('would create a reactive cycle');
	});
});
