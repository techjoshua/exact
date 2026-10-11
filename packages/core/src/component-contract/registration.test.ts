import { expect, it } from 'vitest';
import { attachCompiledComponentContract } from './registration.js';
import { exactComponentContract, exactComponentType } from './symbols.js';

it('retains callable identity and the existing enumerable symbol descriptors', () => {
	function component(value: number) {
		return value + 1;
	}
	const contract = { version: 1 };
	const result = attachCompiledComponentContract(component, 'identity', contract);
	expect(result).toBe(component);
	expect(result(2)).toBe(3);
	expect(result.name).toBe('component');
	expect(result.length).toBe(1);
	for (const [key, value] of [
		[exactComponentType, 'identity'],
		[exactComponentContract, contract]
	] as const) {
		expect(Object.getOwnPropertyDescriptor(result, key)).toEqual({
			value,
			enumerable: true,
			configurable: true,
			writable: true
		});
	}
	expect(exactComponentType).toBe(Symbol.for('@exactjs/component'));
	expect(exactComponentContract).toBe(Symbol.for('@exactjs/component-contract'));
});
