import { exactComponentContract, exactComponentType } from './symbols.js';

/**
 * Attaches compiler-owned metadata without selecting authored built-in bindings.
 * Preserves the original implementation and symbol property descriptors. Contract
 * readers validate the attached protocol before granting execution authority.
 * @internal
 */
export function attachCompiledComponentContract<Implementation extends object>(
	implementation: Implementation,
	id: string,
	contract: object
): Implementation {
	return Object.assign(implementation, {
		[exactComponentType]: id,
		[exactComponentContract]: contract
	});
}
