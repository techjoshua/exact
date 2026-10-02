import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const counter =
	'export class Counter extends Array<number>{#count=1;get count(){return this.#count;}increment(amount=1){return this.#count+=amount;}}';
const definitions = {
	'method descriptor': 'return {work(){return owner.increment();}};',
	'getter descriptor': 'return {get work(){return owner.increment();}};',
	'setter descriptor': 'return {set work(amount:number){owner.increment(amount);}};',
	'lexical super home':
		'const base={amount:1};return {__proto__:base,work(){return owner.increment(super.amount);}};',
	'data property overwrite':
		'const work=()=>owner.increment(2);const replacement:{work?:()=>number}={work};return {work(){return owner.increment();},...replacement};',
	'spread before final method': 'return {...{work:()=>99},work(){return owner.increment();}};'
};

// Object methods retain their authored descriptors and actual home while selecting new ownership.
for (const target of ['client', 'server'] as const)
	for (const [name, definition] of Object.entries(definitions))
		it(`preserves object helper ${name} and transaction lifetime (${target})`, async () => {
			const { compiled, authored, runtime } = await privateHelperArtifact(
				counter + `export function make(owner:Counter){${definition}}`,
				target
			);
			type Counter = { count: number };
			const owner = new (compiled.Counter as new () => Counter)();
			const reference = new (authored.Counter as new () => Counter)();
			const object = (compiled.make as (owner: Counter) => object)(owner);
			const original = (authored.make as (owner: Counter) => object)(reference);
			const descriptor = Object.getOwnPropertyDescriptor(object, 'work')!;
			const referenceDescriptor = Object.getOwnPropertyDescriptor(original, 'work')!;
			const callable = (descriptor.value ?? descriptor.get ?? descriptor.set) as (
				...args: number[]
			) => number;
			const referenceCallable = (referenceDescriptor.value ??
				referenceDescriptor.get ??
				referenceDescriptor.set) as (...args: number[]) => number;
			expect(Reflect.ownKeys(object)).toEqual(Reflect.ownKeys(original));
			expect([descriptor.enumerable, descriptor.configurable, descriptor.writable]).toEqual([
				referenceDescriptor.enumerable,
				referenceDescriptor.configurable,
				referenceDescriptor.writable
			]);
			expect([callable.name, callable.length, callable.prototype]).toEqual([
				referenceCallable.name,
				referenceCallable.length,
				referenceCallable.prototype
			]);
			expect(owner.count).toBe(1);
			expect(() => Reflect.construct(callable, [])).toThrow(TypeError);
			expect(Object.getPrototypeOf(object)).toEqual(Object.getPrototypeOf(original));
			const root = { owner };
			const first = runtime.createPendingReactiveTransaction(root);
			first.read(root, 'owner');
			expect(first.helper(callable, object)(1)).toBe(
				name === 'setter descriptor' ? undefined : name === 'data property overwrite' ? 3 : 2
			);
			expect(owner.count).toBe(1);
			first.discard();
			const next = runtime.createPendingReactiveTransaction(root);
			next.read(root, 'owner');
			next.helper(callable, object)(1);
			expect(owner.count).toBe(1);
			next.commit();
			expect(owner.count).toBe(name === 'data property overwrite' ? 3 : 2);
		});
