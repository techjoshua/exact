import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const forms = {
	'any returned callable':
		'function make(owner:Owner){return ()=>{owner.value++;return owner;};}export function work(owner:Owner){return (make(owner) as any)();}',
	'any receiver factory':
		'export function work(owner:Owner){const receiver={make(){return ()=>{owner.value++;return owner;};}};return (receiver as any).make()();}',
	'immediate arrow':
		'export function work(owner:Owner){return (()=>{owner.value++;return owner;})();}',
	'immediate function':
		'export function work(owner:Owner){return (function(){owner.value++;return owner;})();}',
	'chained returned factory':
		'function make(owner:Owner){return ()=>()=>{owner.value++;return owner;};}export function work(owner:Owner){return make(owner)()();}',
	'computed returned callable':
		'function make(owner:Owner){return [()=>{owner.value++;return owner;}];}export function work(owner:Owner){return make(owner)[0]!();}',
	'constrained generic':
		'export function work<T extends Owner>(owner:T){owner.value++;return owner;}',
	'dependent callback':
		'export function work<T extends Owner>(owner:T){return apply(owner,current=>{current.value++;return current;});}function apply<T,R>(value:T,callback:(value:T)=>R){return callback(value);}',
	'escaped generic closure':
		'function make<T extends Owner>(owner:T){return ()=>{owner.value++;return owner;};}export function work<T extends Owner>(owner:T){return make(owner)();}',
	'immediate nongeneric closure':
		'function make(owner:Owner){return ()=>{owner.value++;return owner;};}export function work(owner:Owner){return make(owner)();}',
	'grouped returned closure':
		'function make(owner:Owner){return ()=>{owner.value++;return owner;};}export function work(owner:Owner){return (make(owner))();}',
	'asserted returned closure':
		'function make(owner:Owner){return ()=>{owner.value++;return owner;};}export function work(owner:Owner){return (make(owner) as ()=>Owner)();}',
	'conditional returned closure':
		'function make(owner:Owner){return ()=>{owner.value++;return owner;};}export function work(owner:Owner){return (owner.value>=0?make(owner):()=>owner)();}',
	'optional returned closure':
		'function make(owner:Owner){return ()=>{owner.value++;return owner;};}export function work(owner:Owner){return make(owner)?.()!;}',
	'conditional type':
		'type Input<T>=T extends number?Owner:never;export function work(owner:Input<number>){owner.value++;return owner;}',
	'mapped type':
		'type Input={ [K in keyof Owner]:Owner[K] };export function work(owner:Input){owner.value++;return owner;}',
	'assertion and satisfies':
		'export function work(input:unknown){const owner=(input as Owner) satisfies Owner;owner.value++;return owner;}'
};

for (const target of ['client', 'server'] as const)
	for (const [name, definition] of Object.entries(forms))
		it(`preserves ${name} helper identity and transactional ownership (${target})`, async () => {
			const { compiled, authored, runtime } = await privateHelperArtifact(
				'type Owner={value:number};' + definition,
				target
			);
			type Owner = { value: number };
			const owner = { value: 0 };
			const reference = { value: 0 };
			const work = compiled.work as (owner: Owner) => Owner;
			expect((authored.work as (owner: Owner) => Owner)(reference)).toBe(reference);
			expect(work(owner)).toBe(owner);
			expect(owner.value).toBe(reference.value);
			const root = { owner };
			const first = runtime.createPendingReactiveTransaction(root);
			first.read(root, 'owner');
			expect(first.helper(work)(owner)).toBe(owner);
			expect(owner.value).toBe(1);
			first.discard();
			expect(owner.value).toBe(1);
			const next = runtime.createPendingReactiveTransaction(root);
			next.read(root, 'owner');
			expect(next.helper(work)(owner)).toBe(owner);
			expect(owner.value).toBe(1);
			next.commit();
			expect(owner.value).toBe(2);
			expect(work(owner)).toBe(owner);
			expect(owner.value).toBe(3);
			const readonly = runtime.reactive(owner, { readonly: true });
			const deniedRoot = { owner: readonly };
			const denied = runtime.createPendingReactiveTransaction(deniedRoot);
			denied.read(deniedRoot, 'owner');
			expect(() => denied.helper(work)(readonly)).toThrow('readonly');
			denied.discard();
			expect(owner.value).toBe(3);
		});
