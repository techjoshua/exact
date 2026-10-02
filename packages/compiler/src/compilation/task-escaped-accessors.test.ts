import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const cases = {
	'literal getter': {
		source: 'return {get value(){owner.value++;return owner.value;}};',
		operation: 'read'
	},
	'computed string getter': {
		source: 'const key=String("value");return {get [key](){owner.value++;return owner.value;}};',
		operation: 'read'
	},
	'computed symbol getter': {
		source:
			'const key=Symbol.for("value");return {get [key](){owner.value++;return owner.value;}};',
		operation: 'symbol'
	},
	'computed unique holder getter': {
		source:
			'const key=Symbol.for("value");const holder:{readonly key:typeof key}={key};return {get [holder.key](){owner.value++;return owner.value;}};',
		operation: 'symbol'
	},
	'computed setter': {
		source: 'const key=String("value");return {set [key](value:number){owner.value=value;}};',
		operation: 'write'
	},
	'computed method': {
		source: 'const key=String("value");return {[key](){owner.value++;return owner.value;}};',
		operation: 'call'
	},
	'computed getter replacement': {
		source:
			'const key=String("value");return {get value(){owner.value+=10;return owner.value;},get [key](){owner.value++;return owner.value;}};',
		operation: 'read'
	},
	'computed getter setter pair': {
		source:
			'const key=String("value");return {get [key](){owner.value++;return owner.value;},set [key](value:number){owner.value=value;}};',
		operation: 'read'
	},
	'computed setter getter pair': {
		source:
			'const key=String("value");return {set [key](value:number){owner.value=value;},get [key](){return owner.value;}};',
		operation: 'write'
	},
	'async computed getter': {
		modifier: 'async ',
		source:
			'const key=String("value");return {get [key](){owner.value++;return owner.value;},ready:await Promise.resolve(1)};',
		operation: 'read'
	},
	'generator computed getter': {
		source:
			'const key=String("value");function* build():Generator<number,{[key:string]:number|undefined},undefined>{return {get [key](){owner.value++;return owner.value;},ready:yield 1};}const iterator=build();iterator.next();return iterator.next().value;',
		operation: 'read'
	},
	'inherited getter': {
		source: 'class Box{get value(){owner.value++;return owner.value;}}return new Box();',
		operation: 'read'
	},
	'module inherited getter': {
		prefix:
			'class Box{constructor(public owner:{value:number}){}get value(){this.owner.value++;return this.owner.value;}}',
		source: 'return new Box(owner);',
		operation: 'read'
	},
	'module inherited setter': {
		prefix:
			'class Box{constructor(public owner:{value:number}){}set value(value:number){this.owner.value=value;}}',
		source: 'return new Box(owner);',
		operation: 'write'
	},
	'inherited setter': {
		source: 'class Box{set value(value:number){owner.value=value;}}return new Box();',
		operation: 'write'
	}
} as const;

for (const target of ['client', 'server'] as const)
	for (const [name, definition] of Object.entries(cases))
		it(`selects current ownership for escaped ${name} (${target})`, async () => {
			const { compiled, runtime } = await privateHelperArtifact(
				`${'prefix' in definition ? definition.prefix : ''}export ${'modifier' in definition ? definition.modifier : ''}function make(owner:{value:number}){${definition.source}}`,
				target
			);
			const owner = { value: 0 };
			const root = { owner };
			const invoke = (
				pending: ReturnType<typeof runtime.createPendingReactiveTransaction>,
				value: object
			) =>
				definition.operation === 'write'
					? pending.write(value, 'value', 1)
					: definition.operation === 'call'
						? pending.method(value, 'value')()
						: pending.read(
								value,
								definition.operation === 'symbol' ? Symbol.for('value') : 'value'
							);
			const creator = runtime.createPendingReactiveTransaction(root);
			creator.read(root, 'owner');
			let selected: object;
			try {
				selected = (await creator.helper(compiled.make)(owner)) as object;
			} finally {
				creator.discard();
			}
			// Escaped callables must choose invocation ownership after their creator has closed.
			for (const settlement of ['discard', 'commit'] as const) {
				const pending = runtime.createPendingReactiveTransaction(root);
				pending.read(root, 'owner');
				try {
					expect(invoke(pending, selected)).toBe(1);
					expect(owner.value).toBe(0);
					expect(pending.read(owner, 'value')).toBe(1);
					pending[settlement]();
					expect(owner.value).toBe(settlement === 'commit' ? 1 : 0);
				} finally {
					pending.discard();
				}
			}
			const deniedOwner = { value: 0 };
			const readonly = runtime.reactive(deniedOwner, { readonly: true });
			const deniedRoot = { owner: readonly };
			const deniedCreator = runtime.createPendingReactiveTransaction(deniedRoot);
			deniedCreator.read(deniedRoot, 'owner');
			let deniedValue: object;
			try {
				deniedValue = (await deniedCreator.helper(compiled.make)(readonly)) as object;
			} finally {
				deniedCreator.discard();
			}
			const denied = runtime.createPendingReactiveTransaction(deniedRoot);
			denied.read(deniedRoot, 'owner');
			try {
				expect(() => invoke(denied, deniedValue)).toThrow('readonly');
				expect(deniedOwner.value).toBe(0);
			} finally {
				denied.discard();
			}
		});
