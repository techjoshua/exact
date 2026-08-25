import type {
	ComponentRegistry,
	ComponentRegistryBuilder,
	ComponentRegistryDefinition
} from './contracts.js';

/** Declares an immutable finite component registry for compiler lowering. */
export function createComponentRegistry<const Definition extends ComponentRegistryDefinition>(
	_define: (builder: ComponentRegistryBuilder) => Definition
): ComponentRegistry<Definition> {
	throw new Error('createComponentRegistry() is source syntax and must be compiled before execution');
}
