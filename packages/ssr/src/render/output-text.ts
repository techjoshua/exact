import { escapeText } from '../html.js';
import type { SsrContext } from '../types.js';
import { isHighSurrogate, isLowSurrogate } from './utf8.js';

/** Escapes dynamic text while charging its exact UTF-8 output bytes through the active sink. */
export function escapeSsrText(context: SsrContext, value: string): string {
	const output = context.outputSink;
	if (!output) return escapeText(value);
	let bytes = 0;
	let html = '';
	let span = 0;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		let escaped: string | undefined;
		if (code === 38) escaped = '&amp;';
		else if (code === 60) escaped = '&lt;';
		else if (code === 62) escaped = '&gt;';
		if (escaped) {
			html += value.slice(span, index) + escaped;
			span = index + 1;
			bytes += escaped.length;
		} else if (code <= 0x7f) bytes++;
		else if (code <= 0x7ff) bytes += 2;
		else if (isHighSurrogate(code) && isLowSurrogate(value.charCodeAt(index + 1))) {
			bytes += 4;
			index++;
		} else bytes += 3;
	}
	const rendered = span === 0 ? value : html + value.slice(span);
	output.accountKnown(rendered, bytes);
	return rendered;
}
