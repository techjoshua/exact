import { exactEnhancementContexts, type EnhancementContextContract } from './contracts.js';

/**
 * Freezes compiler-owned token arrays and attaches their pre-activation contract.
 * Retains the original callable and the immutable, hidden protocol descriptor.
 * @internal
 */
export function attachCompiledEnhancementContexts<Implementation extends object>(
	implementation: Implementation,
	contract: EnhancementContextContract
): Implementation {
	if (contract.provides) Object.freeze(contract.provides);
	if (contract.requires) Object.freeze(contract.requires);
	if (contract.optionallyConsumes) Object.freeze(contract.optionallyConsumes);
	Object.freeze(contract);
	Object.defineProperty(implementation, exactEnhancementContexts, {
		configurable: false,
		enumerable: false,
		value: contract,
		writable: false
	});
	return implementation;
}

/**
 * Reads a compiler-proven dependency contract through module-bound protocol intrinsics.
 * Dependency modules complete initialization before their consumer attaches metadata.
 * @internal
 */
export function readCompiledEnhancementContextDependency(
	dependency: object,
	property: 'provides' | 'requires' | 'optionallyConsumes'
): readonly symbol[] {
	return Reflect.get(dependency, exactEnhancementContexts)[property] as readonly symbol[];
}
