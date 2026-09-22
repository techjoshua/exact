import type { DoctypeOptions } from '@exactjs/core/runtime/component-operations';
import type { SsrContext } from '../types.js';

/** Claims the document declaration and serializes its authored external identifiers. */
export function renderDocumentDoctype(context: SsrContext, declaration: DoctypeOptions): string {
	if (!context.documentProbe || context.documentDoctypeSeen || context.hostStack.length)
		throw new Error('A doctype must occur exactly once before the root html element');
	context.documentDoctypeSeen = true;
	const external =
		declaration.publicId !== undefined
			? ` PUBLIC "${declaration.publicId}" "${declaration.systemId}"`
			: declaration.systemId !== undefined
				? ` SYSTEM "${declaration.systemId}"`
				: '';
	return `<!doctype ${declaration.name ?? 'html'}${external}>`;
}
