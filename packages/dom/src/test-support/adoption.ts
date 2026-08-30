import type { Child } from '@exactjs/core';
import {
	createCompiledComponentReceipt,
	readCompiledComponentReceipt,
	type ExactComponentReceiptData
} from '@exactjs/core/runtime/component-operations';
import {
	adoptCompiledComponentReceiptRoot,
	adoptDocumentCompiledComponentReceiptRoot,
	adoptMarkerlessCompiledComponentReceiptRoot
} from '../framework/component-root.js';
import { TestOperationRoot } from '../testing-component.js';
import type { RenderOptions } from '../types.js';

/** Adopts one compiler-issued component operation using its selected target artifact. */
export function adoptComponentReceiptRoot(
	operation: Child,
	receipt: ExactComponentReceiptData,
	container: Element,
	options: RenderOptions = {}
): boolean {
	return adoptCompiledComponentReceiptRoot(operation, receipt, container, options);
}

/** Adopts one markerless compiler-issued component operation. */
export function adoptMarkerlessComponentReceiptRoot(
	operation: Child,
	receipt: ExactComponentReceiptData,
	container: Element,
	options: RenderOptions = {}
): boolean {
	return adoptMarkerlessCompiledComponentReceiptRoot(operation, receipt, container, options);
}

/** Adopts one compiler-issued component operation without exposing its private receipt payload. */
export function adoptComponentRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {}
): boolean {
	const receipt = readCompiledComponentReceipt(operation);
	return receipt
		? adoptCompiledComponentReceiptRoot(operation, receipt, container, options)
		: false;
}

/** Markerless counterpart to {@link adoptComponentRoot}. */
export function adoptMarkerlessComponentRoot(
	operation: Child,
	container: Element,
	options: RenderOptions = {}
): boolean {
	const receipt = readCompiledComponentReceipt(operation);
	return receipt
		? adoptMarkerlessCompiledComponentReceiptRoot(operation, receipt, container, options)
		: false;
}

/**
 * Adopts a low-level operation beneath an exactc-compiled test root.
 *
 * Renderer contract tests author the nested operation directly, while the component boundary and
 * its dynamic output range use the same compiled ABI as an application root.
 */
export function adoptStatic(
	operation: Child,
	container: Element,
	options: RenderOptions = {}
): boolean {
	const rootOperation = createCompiledComponentReceipt(TestOperationRoot, { operation });
	const receipt = readCompiledComponentReceipt(rootOperation)!;
	return adoptMarkerlessCompiledComponentReceiptRoot(rootOperation, receipt, container, options);
}

/** Adopts a compiled component whose output owns the current document element. */
export function adoptDocumentRoot(
	operation: Child,
	documentNode: Document,
	options: RenderOptions = {}
): boolean {
	const receipt = readCompiledComponentReceipt(operation);
	return receipt
		? adoptDocumentCompiledComponentReceiptRoot(operation, receipt, documentNode, options)
		: false;
}
