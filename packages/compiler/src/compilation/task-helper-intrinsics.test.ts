import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const counter =
	'export class Counter extends Array<number>{#count=1;get count(){return this.#count;}increment(amount=1){return this.#count+=amount;}}';
const shadows = {
	'local Object':
		counter +
		'export function make(owner:Counter){const Object={getOwnPropertyDescriptor(){throw new Error("authored Object inspected");}};void Object;const object={work(){return owner.increment();}};return object.work;}',
	'module Object':
		'const Object={getOwnPropertyDescriptor(){throw new Error("authored Object inspected");}};void Object;' +
		counter +
		'export function make(owner:Counter){return()=>owner.increment();}',
	'module Symbol':
		'const Symbol=()=>{throw new Error("authored Symbol invoked");};void Symbol;' +
		counter +
		'export function make(owner:Counter){return()=>owner.increment();}',
	'module Function':
		'const Function={prototype:{bind(){throw new Error("authored Function invoked");}}};void Function;' +
		counter.replace(
			'increment(amount=1)',
			'make(){return()=>this.increment();}increment(amount=1)'
		) +
		'export function make(owner:Counter){return owner.make();}',
	'module Reflect':
		'const Reflect={apply(){throw new Error("authored Reflect invoked");}};void Reflect;' +
		counter +
		'export function make(owner:Counter){return owner.increment.bind(owner);}'
};

// Generated registration and binding work must not select authored lexical built-in names.
for (const target of ['client', 'server'] as const)
	for (const [name, source] of Object.entries(shadows))
		it(`preserves authored ${name} shadowing during helper registration (${target})`, async () => {
			const { compiled, authored, runtime } = await privateHelperArtifact(source, target);
			type Counter = { count: number };
			type Make = (owner: Counter) => () => number;
			for (const module of [compiled, authored]) {
				const owner = new (module.Counter as new () => Counter)();
				expect((module.make as Make)(owner)()).toBe(2);
			}
			const owner = new (compiled.Counter as new () => Counter)();
			const root = { owner };
			const work = (compiled.make as Make)(owner);
			const pending = runtime.createPendingReactiveTransaction(root);
			pending.read(root, 'owner');
			expect(pending.helper(work)()).toBe(2);
			expect(owner.count).toBe(1);
			const created = pending.helper(compiled.make)(owner) as () => number;
			expect(pending.helper(created)()).toBe(3);
			expect(owner.count).toBe(1);
			pending.commit();
			expect(owner.count).toBe(3);
		});
