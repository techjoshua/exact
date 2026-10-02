import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const counter =
	'export class Counter extends Array<number>{#count=1;get count(){return this.#count;}increment(amount=1){return this.#count+=amount;}}';
const factories = {
	'callback-produced callable':
		'export function make(owner:Counter){return [owner].map(current=>()=>current.increment())[0]!;}',
	'higher-order callable':
		'function produce<T>(owner:T,factory:(owner:T)=>()=>number){return factory(owner);}export function make(owner:Counter){return produce(owner,current=>()=>current.increment());}',
	'arrow parameter default':
		'export function make(owner:Counter,work=()=>owner.increment()){return work;}',
	'function parameter default':
		'export function make(owner:Counter,work=function Work(){return owner.increment();}){return work;}',
	'destructured parameter default':
		'export function make(owner:Counter,{work=()=>owner.increment()}={}){return work;}',
	'wrapped parameter default':
		'export function make(owner:Counter,work=(()=>owner.increment()) satisfies ()=>number){return work;}',
	'conditional callable':
		'export function make(owner:Counter,enabled=true){return enabled?()=>owner.increment():()=>99;}',
	'array-contained callable':
		'export function make(owner:Counter){return [()=>owner.increment()][0]!;}',
	'computed object method':
		'export function make(owner:Counter){const key="work";const object={[key](){return owner.increment();}};return object.work;}',
	'returned object closure':
		'export function make(owner:Counter){const object={work(){return owner.increment();}};return object.work;}',
	'assigned callable binding':
		'export function make(owner:Counter){let work:()=>number;work=()=>owner.increment();return work;}',
	'component-shadowing helper':
		'import type {Component} from "@exactjs/core";function Work(this:Component<{value:number}>){this.state.value=0;return()=>String(this.state.value);}export function make(owner:Counter){const Work=()=>owner.increment();return Work;}',
	'component-shadowing declaration':
		'import type {Component} from "@exactjs/core";function Work(this:Component<{value:number}>){this.state.value=0;return()=>String(this.state.value);}export function make(owner:Counter){function Work(){return owner.increment();}return Work;}',
	'component-shadowing class factory':
		'import type {Component} from "@exactjs/core";function Work(this:Component<{value:number}>){this.state.value=0;return()=>String(this.state.value);}class Maker{static Work(owner:Counter){return()=>owner.increment();}}export function make(owner:Counter){return Maker.Work(owner);}',
	'shadowed callable binding':
		'export function make(owner:Counter){const work=()=>99;{const work=()=>owner.increment();return work;}}'
};

// Escaping factories must bind authored values while selecting the eventual transaction.
for (const target of ['client', 'server'] as const)
	for (const [name, factory] of Object.entries(factories))
		for (const creation of ['ordinary', 'pending'] as const)
			it(`retains ${name} through ${creation} creation and subsequent ownership (${target})`, async () => {
				const { compiled, authored, runtime } = await privateHelperArtifact(
					counter + factory,
					target
				);
				type Counter = { count: number };
				type Make = (owner: Counter) => () => number;
				const reference = new (authored.Counter as new () => Counter)();
				const referenceWork = (authored.make as Make)(reference);
				const ordinary = new (compiled.Counter as new () => Counter)();
				const ordinaryWork = (compiled.make as Make)(ordinary);
				expect([ordinaryWork.name, ordinaryWork.length, ordinaryWork()]).toEqual([
					referenceWork.name,
					referenceWork.length,
					referenceWork()
				]);
				expect(ordinary.count).toBe(2);
				const owner = new (compiled.Counter as new () => Counter)();
				const readonly = runtime.reactive(owner, { readonly: true });
				const root = { owner, readonly };
				const first = runtime.createPendingReactiveTransaction(root);
				first.read(root, 'owner');
				first.read(root, 'readonly');
				const make = creation === 'pending' ? first.helper(compiled.make) : (compiled.make as Make);
				const allowed = make(owner) as () => number;
				const denied = make(readonly) as () => number;
				expect(first.helper(allowed)()).toBe(2);
				expect(owner.count).toBe(1);
				first.discard();
				const next = runtime.createPendingReactiveTransaction(root);
				next.read(root, 'owner');
				next.read(root, 'readonly');
				expect(() => next.helper(denied)()).toThrow('readonly');
				expect(owner.count).toBe(1);
				expect(next.helper(allowed)()).toBe(2);
				expect(owner.count).toBe(1);
				next.commit();
				expect(owner.count).toBe(2);
			});

for (const target of ['client', 'server'] as const)
	it(`retains returned object methods through extracted and explicit receivers (${target})`, async () => {
		const { compiled, authored, runtime } = await privateHelperArtifact(
			counter +
				'export function make(owner:Counter){return {owner,work(){return this.owner.increment();}};}',
			target
		);
		type Counter = { count: number };
		type Object = { owner: Counter; work(): number };
		for (const module of [compiled, authored]) {
			const owner = new (module.Counter as new () => Counter)();
			const object = (module.make as (owner: Counter) => Object)(owner);
			expect(object.work.call(object)).toBe(2);
			expect(owner.count).toBe(2);
		}
		const owner = new (compiled.Counter as new () => Counter)();
		const root = { owner };
		const first = runtime.createPendingReactiveTransaction(root);
		first.read(root, 'owner');
		const object = first.helper(compiled.make)(owner) as Object;
		first.discard();
		const next = runtime.createPendingReactiveTransaction(root);
		next.read(root, 'owner');
		expect(next.helper(object.work, object)()).toBe(2);
		expect(owner.count).toBe(1);
		next.commit();
		expect(owner.count).toBe(2);
	});

for (const target of ['client', 'server'] as const)
	it(`retains explicit default inputs and exactly-once factory evaluation (${target})`, async () => {
		const { compiled, authored, runtime } = await privateHelperArtifact(
			counter +
				'export const events:string[]=[];export function make(owner:Counter,work=(events.push("default"),()=>owner.increment())){events.push("body");return work;}',
			target
		);
		type Counter = { count: number };
		const supplied = () => 99;
		for (const module of [compiled, authored]) {
			const owner = new (module.Counter as new () => Counter)();
			const make = module.make as (owner: Counter, work?: () => number) => () => number;
			expect(make(owner, supplied)).toBe(supplied);
			expect(module.events).toEqual(['body']);
			expect(make(owner)()).toBe(2);
			expect(module.events).toEqual(['body', 'default', 'body']);
		}
		const owner = new (compiled.Counter as new () => Counter)();
		const root = { owner };
		const pending = runtime.createPendingReactiveTransaction(root);
		pending.read(root, 'owner');
		expect(pending.helper(compiled.make)(owner, supplied)).toBe(supplied);
		const work = pending.helper(compiled.make)(owner) as () => number;
		expect(pending.helper(work)()).toBe(2);
		expect(owner.count).toBe(1);
		expect(compiled.events).toEqual(['body', 'default', 'body', 'body', 'default', 'body']);
		pending.discard();
	});
