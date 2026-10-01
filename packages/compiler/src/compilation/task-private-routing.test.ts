import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const cases = [
	['private-method', '#increment(){return ++this.#count;} step(){return this.#increment();}'],
	[
		'private-function-field',
		'#increment=function(this:Counter){return ++this.#count;}; step(){return this.#increment();}'
	],
	['private-arrow-field', '#increment=()=>++this.#count; step(){return this.#increment();}'],
	[
		'private-accessor',
		'get #value(){return this.#count;} set #value(value:number){this.#count=value;} step(){this.#value++;return this.#value;}'
	],
	[
		'extracted-private-method',
		'#increment(){return ++this.#count;} step(){const fn=this.#increment;return fn.call(this);}'
	],
	[
		'optional-private-method',
		'#increment(){return ++this.#count;} step(){return this.#increment?.();}'
	],
	[
		'borrowed-public-method',
		'increment(){return ++this.#count;} step(){return this.increment.call(this);}'
	],
	['public-arrow-field', 'increment=()=>++this.#count; step(){return this.increment();}'],
	[
		'public-function-field',
		'increment=function(this:Counter){return ++this.#count;}; step(){return this.increment();}'
	],
	[
		'private-getter-pending-read',
		'get #value(){return this.#count;} step(){this.#count++;return this.#value;}'
	],
	['private-getter-effect', 'get #value(){return ++this.#count;} step(){return this.#value;}'],
	[
		'private-setter-effect',
		'set #value(value:number){this.#count=value-7;} step(){this.#value=9;return this.#count;}'
	],
	[
		'private-callable-accessor',
		'#increment(){return ++this.#count;} get #fn(){return this.#increment;} step(){return this.#fn();}'
	],
	[
		'applied-private-method',
		'#increment(){return ++this.#count;} step(){return this.#increment.apply(this,[]);}'
	],
	[
		'bound-private-method',
		'#increment(){return ++this.#count;} step(){const fn=this.#increment.bind(this);return fn();}'
	],
	[
		'private-call-arguments',
		'#increment(value:number){this.#count+=value;return this.#count;} step(){return this.#increment(this.#count);}'
	],
	[
		'private-call-default',
		'#increment(value=this.#count){this.#count+=value;return this.#count;} step(){return this.#increment();}'
	],
	[
		'private-method-super',
		'#increment(){return this.#count+=super.value;} step(){return this.#increment();}'
	],
	[
		'static-private-method',
		'static #increment(owner:Counter){return ++owner.#count;} step(){return Counter.#increment(this);}'
	],
	[
		'optional-absent-callable',
		'#increment:((value:number)=>number)|undefined; step(){return this.#increment?.(this.#count++)??++this.#count;}'
	],
	[
		'private-field-super',
		'#increment=()=>this.#count+=super.value;step(){return this.#increment();}'
	],
	[
		'typed-private-call',
		'#increment():number{return ++this.#count;}step():number{return this.#increment();}'
	],
	[
		'private-call-context',
		'#increment(fn:(value:number)=>number){this.#count=fn(this.#count);return this.#count;}step(){return this.#increment(value=>value+1);}'
	],
	[
		'public-call-context',
		'increment(fn:(value:number)=>number){this.#count=fn(this.#count);return this.#count;}step(){return this.increment(value=>value+1);}'
	],
	['public-method-control', 'increment(){return ++this.#count;} step(){return this.increment();}']
] as const;

const adjacentForms = [
	'private-method',
	'private-arrow-field',
	'private-accessor',
	'public-method-control'
];
const variants = cases.flatMap(([name, members]) => [
	{ name, members, substrate: 'plain', form: 'declaration' },
	...(adjacentForms.includes(name)
		? [
				{ name, members, substrate: 'array', form: 'declaration' },
				{ name, members, substrate: 'plain', form: 'expression' }
			]
		: [])
]);
for (const { name, members, substrate, form } of variants)
	for (const target of ['client', 'server'] as const)
		it(`retains private receiver and pending publication for ${name} (${target}, ${substrate}, ${form})`, async () => {
			const definition = `class Counter extends Base {#count=1;get count(){return this.#count;}${members}}`;
			const source = `class Base ${substrate === 'array' ? 'extends Array<number>' : ''} {get value(){return 1;}} ${form === 'expression' ? 'export const Counter=' + definition + ';' : 'export ' + definition}`;
			const {
				compiled: module,
				authored: original,
				runtime
			} = await privateHelperArtifact(source, target);
			type Counter = { count: number; step(): number };
			for (const constructor of [original.Counter, module.Counter]) {
				const control = new (constructor as new () => Counter)();
				expect(control.step()).toBe(2);
				expect(control.count).toBe(2);
			}
			const counter = new (module.Counter as new () => Counter)();
			const root = { counter };
			for (const settlement of ['discard', 'commit'] as const) {
				const pending = runtime.createPendingReactiveTransaction(root);
				pending.read(root, 'counter');
				const retained = pending.helperMember(counter, 'step');
				expect(retained()).toBe(2);
				expect(pending.read(counter, 'count')).toBe(2);
				expect(counter.count).toBe(1);
				pending[settlement]();
				expect(counter.count).toBe(settlement === 'commit' ? 2 : 1);
				expect(() => retained()).toThrow('closed');
				expect(counter.count).toBe(settlement === 'commit' ? 2 : 1);
			}
			if (substrate === 'array') {
				const readonly = runtime.reactive(
					{ counter: new (module.Counter as new () => Counter)() },
					{ readonly: true }
				);
				const pending = runtime.createPendingReactiveTransaction(readonly);
				const alias = pending.read(readonly, 'counter');
				expect(() => pending.helperMember(alias, 'step')()).toThrow('readonly');
				expect(readonly.counter.count).toBe(1);
				pending.discard();
			}
		});
