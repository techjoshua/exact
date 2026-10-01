import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

for (const target of ['client', 'server'] as const) {
	it(`rejects private writes to an owned receiver without its brand before publication (${target})`, async () => {
		const { compiled, authored, runtime } = await privateHelperArtifact(
			'export class Counter {#count=1;assign(){this.#count=2;return 2;}}',
			target
		);
		type Counter = { assign(): number };
		for (const module of [compiled, authored]) {
			const counter = new (module.Counter as new () => Counter)();
			expect(() => counter.assign.call({})).toThrow(TypeError);
		}
		const counter = new (compiled.Counter as new () => Counter)(),
			bad = {},
			root = { counter, bad };
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'bad');
		expect(() => pending.helper(counter.assign, bad)()).toThrow(TypeError);
		pending.discard();
	});
	it(`retains readonly ownership in escaped private bindings (${target})`, async () => {
		const { compiled, runtime } = await privateHelperArtifact(
			'export class Counter extends Array<number> {#count=1;get count(){return this.#count;}#increment(){return ++this.#count;}bound(){return this.#increment.bind(this);}}',
			target
		);
		type Counter = { count: number; bound(): () => number };
		const counter = new (compiled.Counter as new () => Counter)();
		const root = { counter: runtime.reactive(counter, { readonly: true }) };
		const first = runtime.createPendingReactiveTransaction(root);
		const alias = first.read(root, 'counter');
		const bound = first.helperMember(alias, 'bound')();
		first.discard();
		const next = runtime.createPendingReactiveTransaction(root);
		next.read(root, 'counter');
		expect(() => next.helper(bound)()).toThrow('readonly');
		next.discard();
		expect(counter.count).toBe(1);
	});
	it(`executes private setters eagerly and recovers after abrupt completion (${target})`, async () => {
		const { compiled, runtime } = await privateHelperArtifact(
			`export const trace:string[]=[];
export class Counter {#count=1;get count(){return this.#count;}get #value(){trace.push('get');return this.#count*2;}set #value(value:number){trace.push('set:'+value);this.#count=value+1;if(value<0)throw new Error('rejected');}step(value=3){return(this.#value=value);}read(){return this.#value;}}`,
			target
		);
		type Counter = { count: number; step(value?: number): number; read(): number };
		const counter = new (compiled.Counter as new () => Counter)(),
			root = { counter };
		const rejected = runtime.createPendingReactiveTransaction(root);
		rejected.read(root, 'counter');
		expect(() => rejected.helperMember(counter, 'step')(-1)).toThrow('rejected');
		expect(rejected.read(counter, 'count')).toBe(0);
		expect(counter.count).toBe(1);
		rejected.discard();
		expect(compiled.trace).toEqual(['set:-1']);
		const next = runtime.createPendingReactiveTransaction(root);
		next.read(root, 'counter');
		expect(next.helperMember(counter, 'step')()).toBe(3);
		expect(next.helperMember(counter, 'read')()).toBe(8);
		expect(counter.count).toBe(1);
		expect(compiled.trace).toEqual(['set:-1', 'set:3', 'get']);
		next.commit();
		expect(counter.count).toBe(4);
		// Publication applies field writes, without executing the setter or its external effects again.
		expect(compiled.trace).toEqual(['set:-1', 'set:3', 'get']);
	});

	it(`retains private getter brands even when its body reads no fields (${target})`, async () => {
		const { compiled, authored, runtime } = await privateHelperArtifact(
			'export class Counter {get #value(){return 7;}read(){return this.#value;}}',
			target
		);
		type Counter = { read(): number };
		for (const module of [compiled, authored]) {
			const counter = new (module.Counter as new () => Counter)();
			expect(counter.read()).toBe(7);
			expect(() => counter.read.call({})).toThrow(TypeError);
		}
		const counter = new (compiled.Counter as new () => Counter)(),
			root = { counter };
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'counter');
		expect(() => pending.helper(counter.read, {})()).toThrow(TypeError);
		expect(pending.helperMember(counter, 'read')()).toBe(7);
		pending.discard();
	});

	it(`routes escaped private bindings through the eventual transaction (${target})`, async () => {
		const { compiled, runtime } = await privateHelperArtifact(
			'export class Counter {#count=1;get count(){return this.#count;}#increment(){return ++this.#count;}bound(){return this.#increment.bind(this);}}',
			target
		);
		type Counter = { count: number; bound(): () => number };
		const counter = new (compiled.Counter as new () => Counter)(),
			root = { counter };
		const first = runtime.createPendingReactiveTransaction(root);
		first.read(root, 'counter');
		const bound = first.helperMember(counter, 'bound')();
		first.discard();
		for (const settle of ['discard', 'commit'] as const) {
			const next = runtime.createPendingReactiveTransaction(root);
			next.read(root, 'counter');
			expect(next.helper(bound)()).toBe(2);
			expect(counter.count).toBe(1);
			next[settle]();
			expect(counter.count).toBe(settle === 'commit' ? 2 : 1);
		}
	});

	it(`retains field arrow super through subclassing and class-name replacement (${target})`, async () => {
		const { compiled, authored, runtime } = await privateHelperArtifact(
			`class Base {get value(){return 1;}}export let Counter=class extends Base {#count=1;get count(){return this.#count;}get value(){return 99;}#increment=()=>this.#count+=super.value;step(){return this.#increment();}};export class Child extends Counter {override get value(){return 100;}}export const Saved=Counter;Counter=Child;`,
			target
		);
		type Counter = { count: number; step(): number };
		for (const module of [compiled, authored])
			for (const Constructor of [module.Saved, module.Child]) {
				const counter = new (Constructor as new () => Counter)();
				expect(counter.step()).toBe(2);
			}
		for (const Constructor of [compiled.Saved, compiled.Child]) {
			const counter = new (Constructor as new () => Counter)(),
				root = { counter };
			const pending = runtime.createPendingReactiveTransaction(root);
			pending.read(root, 'counter');
			expect(pending.helperMember(counter, 'step')()).toBe(2);
			expect(counter.count).toBe(1);
			pending.commit();
			expect(counter.count).toBe(2);
		}
	});

	it(`selects private receivers before arguments exactly once (${target})`, async () => {
		const { compiled, authored, runtime } = await privateHelperArtifact(
			`export const trace:string[]=[];export class Counter {#count=1;get count(){return this.#count;}select(){trace.push('receiver');return this;}argument(){trace.push('argument');return 1;}#increment(value:number){trace.push('body');this.#count+=value;return this.#count;}step(){return this.select().#increment(this.argument());}}`,
			target
		);
		type Counter = { count: number; step(): number };
		const control = new (authored.Counter as new () => Counter)();
		expect(control.step()).toBe(2);
		expect(authored.trace).toEqual(['receiver', 'argument', 'body']);
		const counter = new (compiled.Counter as new () => Counter)(),
			root = { counter };
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'counter');
		expect(pending.helperMember(counter, 'step')()).toBe(2);
		expect(compiled.trace).toEqual(authored.trace);
		expect(counter.count).toBe(1);
		pending.commit();
		expect(counter.count).toBe(2);
		expect(compiled.trace).toEqual(authored.trace);
	});
}
