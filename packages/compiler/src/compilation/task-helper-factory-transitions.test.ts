import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const counter =
	'export class Counter extends Array<number> {#count=1;get count(){return this.#count;}increment(amount=1){return this.#count+=amount;}}';
for (const target of ['client', 'server'] as const) {
	it(`retains contextual parameter types in a callable class field (${target})`, async () => {
		const source =
			'export class Counter extends Array<number>{value=1;work:(value?:{amount:number})=>number=value=>this.value+=value?.amount??1;}';
		const { compiled, authored, runtime } = await privateHelperArtifact(source, target);
		type Counter = { value: number; work: (value?: { amount: number }) => number };
		for (const module of [compiled, authored]) {
			const owner = new (module.Counter as new () => Counter)();
			expect(owner.work({ amount: 2 })).toBe(3);
		}
		const owner = new (compiled.Counter as new () => Counter)(),
			root = { owner };
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		expect(pending.helper(owner.work, owner)({ amount: 2 })).toBe(3);
		expect(owner.value).toBe(1);
		pending.commit();
		expect(owner.value).toBe(3);
	});
	it(`preserves ordinary factory constructor identity and prototype (${target})`, async () => {
		const { compiled, authored } = await privateHelperArtifact(
			counter +
				'export function make(owner:Counter){return function Work(this:{tag:number},tag=7){this.tag=tag;owner.increment();};}',
			target
		);
		type Counter = { count: number };
		for (const module of [compiled, authored]) {
			const owner = new (module.Counter as new () => Counter)(),
				work = (module.make as (owner: Counter) => (tag?: number) => void)(owner);
			expect([work.name, work.length]).toEqual(['Work', 0]);
			const result = Reflect.construct(work, []) as { tag: number };
			expect(result.tag).toBe(7);
			expect(Object.getPrototypeOf(result)).toBe(work.prototype);
			expect(work.prototype.constructor).toBe(work);
			expect(owner.count).toBe(2);
		}
	});

	it(`retains anonymous factory class home after its variable changes (${target})`, async () => {
		const source =
			'class Base extends Array<number>{get delta(){return 7;}}export let Counter=class extends Base{value=1;make(){return()=>{this.value++;return super.delta;};}};const Original=Counter;export function replace(){Counter=class extends Original{override get delta(){return 99;}};}';
		const { compiled, authored, runtime } = await privateHelperArtifact(source, target);
		type Counter = { value: number; make(): () => number };
		for (const module of [compiled, authored]) {
			const Constructor = module.Counter as new () => Counter;
			expect(Constructor.name).toBe('Counter');
			const owner = new Constructor();
			(module.replace as () => void)();
			expect(owner.make()()).toBe(7);
			expect(owner.value).toBe(2);
		}
		const owner = new (compiled.Counter as new () => Counter)(),
			root = { owner };
		const work = owner.make();
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		expect(pending.helper(work)()).toBe(7);
		expect(owner.value).toBe(1);
		pending.commit();
		expect(owner.value).toBe(2);
	});
	it(`retains a public factory home with a borrowed ordinary receiver (${target})`, async () => {
		const source =
			'class Base extends Array<number>{get delta(){return 7;}}export class Counter extends Base{value=1;make(){return()=>{this.value++;return super.delta;};}}';
		const { compiled, authored, runtime } = await privateHelperArtifact(source, target);
		type Counter = { make(this: { value: number }): () => number };
		for (const module of [compiled, authored]) {
			const prototype = (module.Counter as { prototype: Counter }).prototype;
			const owner = { value: 1 };
			expect(prototype.make.call(owner)()).toBe(7);
			expect(owner.value).toBe(2);
		}
		const owner = { value: 1 },
			root = { owner },
			prototype = (compiled.Counter as { prototype: Counter }).prototype,
			work = prototype.make.call(owner);
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		expect(pending.helper(work)()).toBe(7);
		expect(owner.value).toBe(1);
		pending.commit();
		expect(owner.value).toBe(2);
	});

	it(`retains lexical super in a private factory closure (${target})`, async () => {
		const source =
			'class Base extends Array<number>{get value(){return 7;}}export class Counter extends Base{#count=1;get count(){return this.#count;}#make(){return()=>{this.#count++;return super.value;};}make(){return this.#make();}}';
		const { compiled, authored, runtime } = await privateHelperArtifact(source, target);
		type Counter = { count: number; make(): () => number };
		for (const module of [compiled, authored]) {
			const owner = new (module.Counter as new () => Counter)();
			expect(owner.make()()).toBe(7);
			expect(owner.count).toBe(2);
		}
		const owner = new (compiled.Counter as new () => Counter)(),
			root = { owner };
		const first = runtime.createPendingReactiveTransaction(root);
		first.read(root, 'owner');
		const work = first.helperMember(owner, 'make')();
		first.discard();
		const next = runtime.createPendingReactiveTransaction(root);
		next.read(root, 'owner');
		expect(next.helper(work)()).toBe(7);
		expect(owner.count).toBe(1);
		next.commit();
		expect(owner.count).toBe(2);
	});
	it(`selects subsequent ownership for a factory-created async helper (${target})`, async () => {
		const { compiled, runtime } = await privateHelperArtifact(
			counter +
				'export function make(owner:Counter){return async()=>{await Promise.resolve();return owner.increment();};}',
			target
		);
		type Counter = { count: number };
		const owner = new (compiled.Counter as new () => Counter)(),
			root = { owner };
		const first = runtime.createPendingReactiveTransaction(root);
		first.read(root, 'owner');
		const work = first.helper(compiled.make)(owner);
		first.discard();
		const next = runtime.createPendingReactiveTransaction(root);
		next.read(root, 'owner');
		expect(await next.helper(work)()).toBe(2);
		expect(owner.count).toBe(1);
		next.commit();
		expect(owner.count).toBe(2);
	});

	it(`retains readonly creation policy in an escaped private lexical closure (${target})`, async () => {
		const source =
			'export class Counter extends Array<number>{#count=1;get count(){return this.#count;}#make(){return(amount=1)=>this.#count+=amount;}make(){return this.#make();}}';
		const { compiled, authored, runtime } = await privateHelperArtifact(source, target);
		type Counter = { count: number; make(): () => number };
		for (const module of [compiled, authored]) {
			const owner = new (module.Counter as new () => Counter)();
			const work = owner.make();
			expect([work.name, work.length, work()]).toEqual(['', 0, 2]);
		}
		const owner = new (compiled.Counter as new () => Counter)(),
			readonly = runtime.reactive(owner, { readonly: true }),
			writable = runtime.reactive(owner),
			root = { readonly, writable };
		const first = runtime.createPendingReactiveTransaction(root);
		first.read(root, 'readonly');
		first.read(root, 'writable');
		const denied = first.helperMember(readonly, 'make')() as () => number,
			allowed = first.helperMember(writable, 'make')() as () => number;
		expect([denied.name, denied.length, allowed.name, allowed.length]).toEqual(['', 0, '', 0]);
		first.discard();
		const next = runtime.createPendingReactiveTransaction(root);
		next.read(root, 'readonly');
		next.read(root, 'writable');
		expect(() => next.helper(denied)()).toThrow('readonly');
		expect(owner.count).toBe(1);
		expect(next.helper(allowed)()).toBe(2);
		expect(owner.count).toBe(1);
		next.commit();
		expect(owner.count).toBe(2);
	});
	it(`retains constructor-created native binding (${target})`, async () => {
		const source =
			'export class Counter extends Array<number>{#count=1;work:()=>number;constructor(){super();this.work=this.increment.bind(this);}get count(){return this.#count;}increment(){return ++this.#count;}}';
		const { compiled, runtime } = await privateHelperArtifact(source, target);
		type Counter = { count: number; work: () => number };
		const owner = new (compiled.Counter as new () => Counter)(),
			root = { owner };
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		expect(pending.helper(owner.work)()).toBe(2);
		expect(owner.count).toBe(1);
		pending.commit();
		expect(owner.count).toBe(2);
	});

	it(`preserves readonly ownership in a factory-initialized callable field (${target})`, async () => {
		const { compiled, runtime } = await privateHelperArtifact(
			'export class Counter extends Array<number>{#count=1;get count(){return this.#count;}increment(){return ++this.#count;}work=make(this);}export function make(owner:Counter){return()=>owner.increment();}',
			target
		);
		type Counter = { count: number };
		const owner = new (compiled.Counter as new () => Counter)(),
			readonly = runtime.reactive(owner, { readonly: true }),
			writable = runtime.reactive(owner),
			root = { readonly, writable };
		const first = runtime.createPendingReactiveTransaction(root);
		first.read(root, 'readonly');
		first.read(root, 'writable');
		expect(() => first.helperMember(readonly, 'work')()).toThrow('readonly');
		expect(owner.count).toBe(1);
		expect(first.helperMember(writable, 'work')()).toBe(2);
		expect(owner.count).toBe(1);
		first.discard();
		const next = runtime.createPendingReactiveTransaction(root);
		next.read(root, 'writable');
		expect(next.helperMember(writable, 'work')()).toBe(2);
		next.commit();
		expect(owner.count).toBe(2);
	});

	it(`retains distinct loop-created binding receivers and prefixes (${target})`, async () => {
		const { compiled, runtime } = await privateHelperArtifact(
			counter +
				'export function makeAll(owners:Counter[]){const result:(()=>number)[]=[];for(let index=0;index<owners.length;index++)result.push(owners[index]!.increment.bind(owners[index]!,index+1));return result;}',
			target
		);
		type Counter = { count: number };
		const owners = [
			new (compiled.Counter as new () => Counter)(),
			new (compiled.Counter as new () => Counter)()
		];
		const work = (compiled.makeAll as (owners: Counter[]) => (() => number)[])(owners),
			root = { owners };
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owners');
		pending.read(owners, '0');
		pending.read(owners, '1');
		expect(work.map((fn) => pending.helper(fn)())).toEqual([2, 3]);
		expect(owners.map((owner) => owner.count)).toEqual([1, 1]);
		pending.commit();
		expect(owners.map((owner) => owner.count)).toEqual([2, 3]);
	});
	it(`retains ordinary binding in a parameter default (${target})`, async () => {
		const { compiled, runtime } = await privateHelperArtifact(
			counter +
				'export function make(owner:Counter,work=owner.increment.bind(owner)){return work;}',
			target
		);
		type Counter = { count: number };
		const owner = new (compiled.Counter as new () => Counter)(),
			root = { owner };
		const work = (compiled.make as (owner: Counter) => () => number)(owner);
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		expect(pending.helper(work)()).toBe(2);
		expect(owner.count).toBe(1);
		pending.commit();
		expect(owner.count).toBe(2);
	});
	it(`retains binding arguments across authored suspension (${target})`, async () => {
		const { compiled, runtime } = await privateHelperArtifact(
			counter +
				'export async function make(owner:Counter){return owner.increment.bind(await Promise.resolve(owner));}',
			target
		);
		type Counter = { count: number };
		const owner = new (compiled.Counter as new () => Counter)(),
			root = { owner };
		const work = await (compiled.make as (owner: Counter) => Promise<() => number>)(owner);
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		expect(pending.helper(work)()).toBe(2);
		expect(owner.count).toBe(1);
		pending.commit();
		expect(owner.count).toBe(2);
	});
	it(`preserves an overridden bind selection (${target})`, async () => {
		const { compiled, authored, runtime } = await privateHelperArtifact(
			counter +
				'export const trace:string[]=[];const callable={bind(owner:Counter){trace.push(String(owner.count));return()=>11;}};export function make(owner:Counter){return callable.bind(owner);}',
			target
		);
		type Counter = { count: number };
		for (const module of [compiled, authored]) {
			const owner = new (module.Counter as new () => Counter)();
			expect((module.make as (owner: Counter) => () => number)(owner)()).toBe(11);
			expect(module.trace).toEqual(['1']);
		}
		const owner = new (compiled.Counter as new () => Counter)(),
			root = { owner };
		const first = runtime.createPendingReactiveTransaction(root);
		first.read(root, 'owner');
		const work = first.helper(compiled.make)(owner);
		first.discard();
		const next = runtime.createPendingReactiveTransaction(root);
		next.read(root, 'owner');
		expect(next.helper(work)()).toBe(11);
		next.discard();
		expect(owner.count).toBe(1);
	});
	it(`retains native optional binding and its absent control (${target})`, async () => {
		const { compiled, runtime } = await privateHelperArtifact(
			counter +
				'export const trace:string[]=[];export function make(owner:Counter,present=true){const fn=present?owner.increment:undefined;return fn?.bind((trace.push("argument"),owner));}',
			target
		);
		type Counter = { count: number };
		const owner = new (compiled.Counter as new () => Counter)(),
			root = { owner };
		const make = compiled.make as (owner: Counter, present?: boolean) => (() => number) | undefined;
		expect(make(owner, false)).toBeUndefined();
		expect(compiled.trace).toEqual([]);
		const work = make(owner);
		expect(compiled.trace).toEqual(['argument']);
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		expect(pending.helper(work)()).toBe(2);
		expect(owner.count).toBe(1);
		pending.commit();
		expect(owner.count).toBe(2);
	});
}
