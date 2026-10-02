import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const counter =
	'export class Counter extends Array<number>{#count=1;get count(){return this.#count;}increment(){return ++this.#count;}}export const owner=new Counter();';
const forms = {
	'object method':
		'export const object={work(){return owner.increment();}};export const work=object.work;',
	arrow: 'export const work=()=>owner.increment();',
	declaration: 'export function work(){return owner.increment();}'
};

for (const target of ['client', 'server'] as const) {
	for (const [name, definition] of Object.entries(forms))
		it(`isolates module-captured ${name} across transactions (${target})`, async () => {
			const { compiled, authored, runtime } = await privateHelperArtifact(
				counter + definition,
				target
			);
			type Counter = { count: number };
			const owner = compiled.owner as Counter;
			const work = compiled.work as () => number;
			expect((authored.work as () => number)()).toBe(2);
			const root = { owner };
			const first = runtime.createPendingReactiveTransaction(root);
			first.read(root, 'owner');
			expect(first.helper(work, compiled.object)()).toBe(2);
			expect(owner.count).toBe(1);
			first.discard();
			expect(owner.count).toBe(1);
			const next = runtime.createPendingReactiveTransaction(root);
			next.read(root, 'owner');
			expect(next.helper(work, compiled.object)()).toBe(2);
			expect(owner.count).toBe(1);
			next.commit();
			expect(owner.count).toBe(2);
		});

	it(`preserves module-captured reference identity in compiled helpers (${target})`, async () => {
		const { compiled, authored, runtime } = await privateHelperArtifact(
			counter +
				`
export const equal=(value:Counter)=>value===owner;
export const unequal=(value:Counter)=>value!==owner;
const values=new Map([[owner,9]]);export const lookup=(value:Counter)=>values.get(value);
export const retain=(value:Counter)=>value;
export const scalar=(value:number)=>value+1;`,
			target
		);
		for (const module of [compiled, authored]) {
			expect((module.equal as (value: unknown) => boolean)(module.owner)).toBe(true);
			expect((module.unequal as (value: unknown) => boolean)(module.owner)).toBe(false);
		}
		const root = { owner: compiled.owner };
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		expect(pending.helper(compiled.equal)(compiled.owner)).toBe(true);
		expect(pending.helper(compiled.unequal)(compiled.owner)).toBe(false);
		expect(pending.helper(compiled.lookup)(compiled.owner)).toBe(9);
		expect(pending.helper(compiled.retain)(compiled.owner)).toBe(compiled.owner);
		expect(pending.helper(compiled.scalar)(2)).toBe(3);
		pending.discard();
	});
}

for (const target of ['client', 'server'] as const)
	it(`preserves guarded callable receiver and pending fields (${target})`, async () => {
		const { compiled, authored, runtime } = await privateHelperArtifact(
			`
export const owner={value:0,callback(){return this.value;}};
export function work(owner:{value:number;callback?:()=>number}){owner.value++;if(typeof owner.callback==='function')return owner.callback();return -1;}`,
			target
		);
		type Owner = { value: number; callback?: () => number };
		const owner = compiled.owner as Owner;
		const work = compiled.work as (owner: Owner) => number;
		expect((authored.work as (owner: Owner) => number)(authored.owner as Owner)).toBe(1);
		const root = { owner };
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		expect(pending.helper(work)(owner)).toBe(1);
		expect(owner.value).toBe(0);
		pending.commit();
		expect(owner.value).toBe(1);
		const absent = { value: 0 };
		expect(work(absent)).toBe(-1);
		expect(absent.value).toBe(1);
	});
