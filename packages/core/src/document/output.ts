import {
	createOpaqueOperation,
	executeOpaqueOperation,
	sharedOpaqueOperationStore
} from '../component-abi/opaque-operation.js';
import { createCompiledFragmentReceipt } from '../component-abi/fragment-receipt.js';

/** Renderer dispatch for request-owned document output; browser rendering emits no new assets. */
export const exactDocumentOutputOperation = Symbol.for('@exactjs/target-operation/document-output');

/** Framework output positions understood by the document renderer. */
export type DocumentOutputKind = 'styles' | 'headScripts' | 'hydrationData' | 'bootstrap';

/** Target-local publication capability. No request state is retained in the shared markers. */
export interface DocumentOutputTarget {
	[exactDocumentOutputOperation]?: (kind: DocumentOutputKind) => unknown;
}

const empty = createCompiledFragmentReceipt(null);
const markerKinds = sharedOpaqueOperationStore<DocumentOutputKind>('document-output');

function marker(kind: DocumentOutputKind): object {
	const operation = createOpaqueOperation(function (target: object) {
		const publish = (target as DocumentOutputTarget)[exactDocumentOutputOperation];
		return publish ? publish.call(target, kind) : executeOpaqueOperation(empty, target)?.value;
	});
	markerKinds.set(operation, kind);
	return operation;
}

/** Recognizes local document slots during browser adoption without executing their output. */
export function isDocumentOutput(value: unknown): boolean {
	return typeof value === 'object' && value !== null && markerKinds.has(value);
}

/**
 * Opaque, reusable document slots resolved by the renderer for each request. Styles and head
 * scripts belong in head; hydration data precedes bootstrap at the end of body. Browser mounts
 * do not fetch assets or serialize state through these markers.
 */
export const documentOutput = Object.freeze({
	styles: marker('styles'),
	headScripts: marker('headScripts'),
	hydrationData: marker('hydrationData'),
	bootstrap: marker('bootstrap')
});
