import type { Child } from '@exactjs/core';
import {
	createCompiledComponentInputReceipt,
	inspectComponentInput
} from '@exactjs/core/runtime/component-operations';
import {
	adoptCompiledComponentInputRoot,
	adoptDocumentCompiledComponentInputRoot,
	adoptMarkerlessCompiledComponentInputRoot,
	type ComponentRootAdoption
} from '../framework/component-root.js';
import { TestOperationRoot } from '../testing-component.js';
import type { RenderOptions } from '../types.js';
/** Adopts an issued component through the provider-owned root admission boundary. */
export function adoptComponentRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {}
): boolean {
	return inspectComponentInput(operation).kind === 'noncomponent'
		? false
		: isCurrentAdoption(adoptCompiledComponentInputRoot(operation, container, options));
}
/** Omits only the outer component boundary. Nested structural ranges still require their markers. */
export function adoptMarkerlessComponentRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {}
): boolean {
	return inspectComponentInput(operation).kind === 'noncomponent'
		? false
		: isCurrentAdoption(adoptMarkerlessCompiledComponentInputRoot(operation, container, options));
}
/** Adopts a low-level operation through an actual compiled test root with normal provider admission. */
export function adoptStatic(
	operation: Child,
	container: Element,
	options: RenderOptions = {}
): boolean {
	const rootOperation = createCompiledComponentInputReceipt(TestOperationRoot, { operation });
	return isCurrentAdoption(
		adoptMarkerlessCompiledComponentInputRoot(rootOperation, container, options)
	);
}
/** Adopts an issued component whose output owns the document element. */
export function adoptDocumentRoot(
	operation: Child,
	documentNode: Document,
	options: RenderOptions = {}
): boolean {
	return inspectComponentInput(operation).kind === 'noncomponent'
		? false
		: isCurrentAdoption(adoptDocumentCompiledComponentInputRoot(operation, documentNode, options));
}

/** The boolean test facade accepts only an adopted result whose receiving attempt remains current. */
function isCurrentAdoption(result: ComponentRootAdoption): boolean {
	return result.outcome === 'adopted' && result.isCurrent();
}
