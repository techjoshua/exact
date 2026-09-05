import { escapeAttr } from '../html.js';
import type { SsrContext } from '../types.js';

const requiresAttributeEscaping = /[&<>\"]/;

/** Serializes one finalized attribute value and accounts its UTF-8 bytes without rescanning it. */
export function renderAccountedAttribute(
	context: Pick<SsrContext, 'outputSink'>,
	attributeName: string,
	value: string
): string {
	const output = context.outputSink;
	if (!output) return ` ${attributeName}="${escapeAttr(value)}"`;
	const escapedValue = requiresAttributeEscaping.test(value) ? escapeAttr(value) : value;
	const rendered = ` ${attributeName}="${escapedValue}"`;
	output.account(rendered);
	return rendered;
}
