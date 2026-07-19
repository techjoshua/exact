import type { EmitOptions, ExpressionNode } from '../model.js';

/** Performs the print node domain operation. */
export function printNode(node: ExpressionNode): string {
	if (node.generatedText !== undefined) return node.generatedText;
	if (node.text !== undefined) return node.text;
	throw new Error(`Node ${node.kind} cannot be emitted without source or generated text`);
}

/** Transforms generated into its required representation. */
export function normalizeGenerated(code: string, options?: EmitOptions): string {
	let output = code;
	if (options?.quote === 'single')
		output = output.replace(
			/"([^"\\]*(?:\\.[^"\\]*)*)"/g,
			(_match, value: string) => `'${value.replace(/'/g, "\\'")}'`
		);
	if (options?.semicolons === false) output = output.replace(/;(?=\r?$)/gm, '');
	if (options?.newline === 'crlf') output = output.replace(/\r?\n/g, '\r\n');
	return output;
}

/** Performs the indent lines domain operation. */
export function indentLines(text: string, indent: string): string {
	return text.replace(/\n/g, `\n${indent}`);
}

/** Performs the safe property name domain operation. */
export function safePropertyName(name: string): string {
	return /^[$A-Z_a-z][$\w]*$/.test(name) ? name : JSON.stringify(name);
}
