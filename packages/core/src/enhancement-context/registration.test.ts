import { expect, it } from 'vitest';
import { exactEnhancementContexts } from './contracts.js';
import {
	attachCompiledEnhancementContexts,
	readCompiledEnhancementContextDependency
} from './registration.js';

it('retains dependency token identity and the immutable hidden metadata contract', () => {
	const token = Symbol('token');
	const provides = [token];
	const contract = { provides, requires: [], optionallyConsumes: [], transparentTarget: true };
	function provider() {}
	expect(attachCompiledEnhancementContexts(provider, contract)).toBe(provider);
	expect(readCompiledEnhancementContextDependency(provider, 'provides')).toBe(provides);
	expect(Object.isFrozen(contract)).toBe(true);
	for (const array of [contract.provides, contract.requires, contract.optionallyConsumes])
		expect(Object.isFrozen(array)).toBe(true);
	expect(Object.getOwnPropertyDescriptor(provider, exactEnhancementContexts)).toEqual({
		value: contract,
		configurable: false,
		enumerable: false,
		writable: false
	});
	expect(() => attachCompiledEnhancementContexts(provider, { provides: [] })).toThrow(TypeError);
	expect(() => readCompiledEnhancementContextDependency(() => undefined, 'provides')).toThrow(
		TypeError
	);
});
