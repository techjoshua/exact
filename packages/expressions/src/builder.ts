import { ModuleBuilder } from './builder/module-builder.js';

export { BlockBuilder } from './builder/block.js';
export { ClassBuilder } from './builder/class.js';
export type {
	FunctionOptions,
	ImportOptions,
	MethodOptions,
	PropertyOptions
} from './builder/contracts.js';
export { FunctionBuilder } from './builder/function.js';
export { ModuleBuilder } from './builder/module-builder.js';
export { printNode } from './builder/printing.js';
export { TypeBuilder } from './builder/types.js';

/** Creates a programmatic expression module builder. */
export function moduleBuilder(filename: string): ModuleBuilder {
	return new ModuleBuilder(filename);
}
