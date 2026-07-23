import type { ExactPatch } from '@exactjs/server';
import { escapeAttr, escapeText, voidElements } from '../html.js';
import type { BoundaryRefreshOptions } from '../types.js';
import { type ParsedHtmlElement, type ParsedHtmlNode } from './elements.js';
import { collectNormalizedShapeIds } from './parsing.js';

/** Performs the same keys domain operation. */
export function sameKeys<T>(left: Map<string, T>, right: Map<string, T>): boolean {
	if (left.size !== right.size) return false;
	for (const key of left.keys()) {
		if (!right.has(key)) return false;
	}
	return true;
}

/** Performs the text only content domain operation. */
export function textOnlyContent(element: ParsedHtmlElement): string | undefined {
	let text = '';
	for (const child of element.children) {
		if (child.kind !== 'text') return undefined;
		text += child.value;
	}
	return text;
}

/** Performs the diff style attribute domain operation. */
export function diffStyleAttribute(
	id: string,
	previous: string | undefined,
	next: string | undefined
): ExactPatch[] | undefined {
	const previousStyle = parseStyleAttribute(previous ?? '');
	const nextStyle = parseStyleAttribute(next ?? '');
	if (!previousStyle || !nextStyle) return undefined;
	const patches: ExactPatch[] = [];
	for (const [name, value] of nextStyle) {
		if (previousStyle.get(name) !== value) {
			patches.push({ type: 'style', id, name, value });
		}
	}
	for (const name of previousStyle.keys()) {
		if (!nextStyle.has(name)) {
			patches.push({ type: 'style', id, name, value: null });
		}
	}
	return patches;
}

/** Reads a style attribute from its source representation. */
export function parseStyleAttribute(value: string): Map<string, string> | undefined {
	const styles = new Map<string, string>();
	const trimmed = value.trim();
	if (!trimmed) return styles;
	for (const declaration of trimmed.split(';')) {
		const part = declaration.trim();
		if (!part) continue;
		const separator = part.indexOf(':');
		if (separator <= 0) return undefined;
		const name = part.slice(0, separator).trim();
		const styleValue = part.slice(separator + 1).trim();
		if (!name || !styleValue) return undefined;
		styles.set(name, styleValue);
	}
	return styles;
}

/** Performs the same normalized html shape domain operation. */
export function sameNormalizedHtmlShape(
	left: readonly ParsedHtmlNode[],
	right: readonly ParsedHtmlNode[]
): boolean {
	if (left.length !== right.length) return false;
	const interner = new Map<string, number>();
	const leftIds = collectNormalizedShapeIds(left, interner);
	const rightIds = collectNormalizedShapeIds(right, interner);
	return left.every((node, index) => leftIds.get(node) === rightIds.get(right[index]!));
}

/** Produces a parsed html element in its external representation. */
export function serializeParsedHtmlElement(element: ParsedHtmlElement): string {
	const output: string[] = [];
	const pending: Array<ParsedHtmlNode | string> = [element];
	while (pending.length) {
		const node = pending.pop()!;
		if (typeof node === 'string') {
			output.push(node);
			continue;
		}
		if (node.kind === 'text') {
			output.push(escapeText(node.value));
			continue;
		}
		const attributes = Array.from(node.attributes)
			.map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`))
			.join('');
		output.push(`<${node.tagName}${attributes}>`);
		if (voidElements.has(node.tagName.toLowerCase())) continue;
		pending.push(`</${node.tagName}>`);
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push(node.children[index]!);
	}
	return output.join('');
}

/** Performs the boundary patch domain operation. */
export function boundaryPatch(
	boundaryId: string,
	html: string,
	strategy: BoundaryRefreshOptions['patchStrategy']
): ExactPatch {
	if (strategy === 'text' && isTextOnlyHtml(html)) {
		return {
			type: 'text',
			id: boundaryId,
			value: decodeEscapedText(html)
		};
	}
	return {
		type: 'replace',
		id: boundaryId,
		html
	};
}

/** Reports whether text only html. */
export function isTextOnlyHtml(html: string): boolean {
	return !/[<>]/.test(html);
}

/** Reads an escaped text from its source representation. */
export function decodeEscapedText(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16))
		)
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

/** Reads a simple element from its source representation. */
export function parseSimpleElement(
	html: string
): { tagName: string; attributes: Map<string, string | true>; text: string } | undefined {
	const match = /^<([A-Za-z][A-Za-z0-9:-]*)([^>]*)>([^<>]*)<\/\1>$/.exec(html);
	if (!match) return undefined;
	const [, tagName, rawAttributes, text] = match;
	const attributes = parseSimpleAttributes(rawAttributes ?? '');
	if (!attributes) return undefined;
	return { tagName: tagName!, attributes, text: text ?? '' };
}

/** Reads a simple attributes from its source representation. */
export function parseSimpleAttributes(raw: string): Map<string, string | true> | undefined {
	const attributes = new Map<string, string | true>();
	let rest = raw.trim();
	while (rest) {
		const match = /^([A-Za-z_:][A-Za-z0-9_:.-]*)(?:="([^"]*)")?/.exec(rest);
		if (!match) return undefined;
		attributes.set(match[1]!, match[2] === undefined ? true : decodeEscapedText(match[2]));
		rest = rest.slice(match[0].length).trim();
	}
	return attributes;
}

/** Performs the string attribute domain operation. */
export function stringAttribute(
	element: { attributes: Map<string, string | true> },
	name: string
): string | undefined {
	return stringValue(element.attributes.get(name));
}

/** Performs the string value domain operation. */
export function stringValue(value: string | true | undefined): string | undefined {
	return typeof value === 'string' ? value : undefined;
}
