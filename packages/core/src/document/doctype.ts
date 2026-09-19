import {
	createOpaqueOperation,
	executeOpaqueOperation,
	sharedOpaqueOperationStore
} from '../component-abi/opaque-operation.js';
import { createCompiledFragmentReceipt } from '../component-abi/fragment-receipt.js';

/** Document declaration identifiers. Omission emits the HTML5 declaration. */
export type DoctypeOptions = Readonly<{ name?: string; publicId?: string; systemId?: string }>;

/** Renderer dispatch for an explicitly authored document declaration. */
export const exactDoctypeOperation = Symbol.for('@exactjs/target-operation/doctype');
const declarations = sharedOpaqueOperationStore<DoctypeOptions>('doctype');
const empty = createCompiledFragmentReceipt(null);

/**
 * Authors a document declaration before the html element. The renderer escapes no markup into
 * this grammar: invalid names and quoted identifiers are rejected. Browser adoption retains
 * the declaration parsed from the server response rather than creating a second one.
 */
export function doctype(options: DoctypeOptions = {}): object {
	const name = options.name ?? 'html';
	if (!/^[A-Za-z][A-Za-z0-9:_-]*$/.test(name)) throw new TypeError('Invalid doctype name');
	for (const value of [options.publicId, options.systemId])
		if (value !== undefined && /["<>\u0000-\u001f]/.test(value))
			throw new TypeError('Invalid doctype identifier');
	if (options.publicId !== undefined && options.systemId === undefined)
		throw new TypeError('A public doctype requires a system identifier');
	const declaration = Object.freeze({ ...options, name });
	const operation = createOpaqueOperation(function (target: object) {
		const publish = (
			target as { [exactDoctypeOperation]?: (declaration: DoctypeOptions) => unknown }
		)[exactDoctypeOperation];
		return publish
			? publish.call(target, declaration)
			: executeOpaqueOperation(empty, target)?.value;
	});
	declarations.set(operation, declaration);
	return operation;
}

/** Reads only framework-issued doctype declarations without executing them. */
export function readDoctype(value: unknown): DoctypeOptions | undefined {
	return typeof value === 'object' && value !== null ? declarations.get(value) : undefined;
}
