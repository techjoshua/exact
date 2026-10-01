import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const factories = {
	'contextually typed arrow':
		'export function make(owner: Counter): (value?: {amount:number})=>number { return value => owner.increment(value?.amount ?? 1); }',
	'returned arrow': 'export function make(owner: Counter) { return () => owner.increment(); }',
	'returned function':
		'export function make(owner: Counter) { return function () { return owner.increment(); }; }',
	'local arrow':
		'export function make(owner: Counter) { const work = () => owner.increment(); return work; }',
	'local declaration':
		'export function make(owner: Counter) { function work() { return owner.increment(); } return work; }',
	'parameterized arrow':
		'export function make(owner: Counter) { return (amount = 1) => owner.increment(amount); }',
	'bound method': 'export function make(owner: Counter) { return owner.increment.bind(owner); }'
};

for (const target of ['client', 'server'] as const)
	for (const [name, factory] of Object.entries(factories))
		for (const creation of ['ordinary', 'pending'] as const)
			it(`retains ${name} across ${creation} factory creation and subsequent invocation (${target})`, async () => {
				const source = `export class Counter extends Array<number> { #count = 1; get count() { return this.#count; } increment(amount = 1) { return this.#count += amount; } } ${factory}`;
				const { compiled, authored, runtime } = await privateHelperArtifact(source, target);
				type Counter = { count: number };
				for (const module of [compiled, authored]) {
					const owner = new (module.Counter as new () => Counter)();
					const work = (module.make as (owner: Counter) => () => number)(owner);
					expect(work()).toBe(2);
					expect(owner.count).toBe(2);
				}
				const owner = new (compiled.Counter as new () => Counter)(),
					root = { owner };
				const first = runtime.createPendingReactiveTransaction(root);
				first.read(root, 'owner');
				const work =
					creation === 'pending'
						? first.helper(compiled.make)(owner)
						: (compiled.make as (owner: Counter) => () => number)(owner);
				expect(first.helper(work)()).toBe(2);
				expect(owner.count).toBe(1);
				first.discard();
				const next = runtime.createPendingReactiveTransaction(root);
				next.read(root, 'owner');
				expect(next.helper(work)()).toBe(2);
				expect(owner.count).toBe(1);
				next.commit();
				expect(owner.count).toBe(2);
			});
