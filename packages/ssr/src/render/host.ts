import type { Child } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { SsrContext } from '../types.js';

/** Root-document claims that must roll back with an unpublished component attempt. */
export type DocumentHostCheckpoint = Pick<
	SsrContext,
	| 'documentProbe'
	| 'documentRootSeen'
	| 'documentHeadSeen'
	| 'documentBodySeen'
	| 'documentOutputs'
	| 'documentDoctypeSeen'
>;

/** Captures document claims without changing the balanced intrinsic ancestry stack. */
export function checkpointDocumentHost(context: SsrContext): DocumentHostCheckpoint {
	return {
		documentDoctypeSeen: context.documentDoctypeSeen,
		documentOutputs: context.documentOutputs ? new Set(context.documentOutputs) : undefined,
		documentProbe: context.documentProbe,
		documentRootSeen: context.documentRootSeen,
		documentHeadSeen: context.documentHeadSeen,
		documentBodySeen: context.documentBodySeen
	};
}

/** Restores claims after an attempt whose intrinsic traversal has already unwound. */
export function restoreDocumentHost(context: SsrContext, checkpoint: DocumentHostCheckpoint): void {
	context.documentProbe = checkpoint.documentProbe;
	context.documentRootSeen = checkpoint.documentRootSeen;
	context.documentHeadSeen = checkpoint.documentHeadSeen;
	context.documentBodySeen = checkpoint.documentBodySeen;
	context.documentOutputs = checkpoint.documentOutputs;
	context.documentDoctypeSeen = checkpoint.documentDoctypeSeen;
}

/** Enters one already-normalized intrinsic operation. */
export function enterHostTag(
	context: SsrContext,
	inputTag: string
): { tag: string; prefix: string } {
	const tag = inputTag.toLowerCase();
	const parentTag = context.hostStack[context.hostStack.length - 1];
	if (tag === 'html') {
		if (!context.documentProbe || context.hostStack.length || context.documentRootSeen)
			throw new Error(
				'A root document may contain exactly one top-level <html> element; nested or duplicate <html> elements are not allowed.'
			);
		context.documentProbe = false;
		context.documentRootSeen = true;
	} else if (!context.hostStack.length) {
		if (context.documentRootSeen)
			throw new Error('A root document cannot render host content outside its <html> element.');
		context.documentProbe = false;
	}
	if (context.documentRootSeen && (tag === 'head' || tag === 'body')) {
		if (parentTag !== 'html')
			throw new Error(`<${tag}> is only valid as a direct child of the root <html> element.`);
		if (tag === 'head') {
			if (context.documentHeadSeen)
				throw new Error('A root document may contain at most one <head> element.');
			context.documentHeadSeen = true;
		} else {
			if (context.documentBodySeen)
				throw new Error('A root document may contain at most one <body> element.');
			context.documentBodySeen = true;
		}
	}
	context.hostStack.push(tag);
	return {
		tag,
		prefix:
			tag === 'html' && context.documentRootSeen && !context.documentDoctypeSeen
				? '<!doctype html>'
				: ''
	};
}

/** Leaves one intrinsic host domain. */
export function leaveHost(context: SsrContext, tag: string): void {
	if (context.hostStack.pop() !== tag)
		throw new Error('eXact SSR host traversal became unbalanced.');
}

/** Claims scalar output in the root document domain. */
export function claimRootText(context: SsrContext): void {
	if (context.hostStack.length) return;
	if (context.documentRootSeen)
		throw new Error('A root document cannot render text outside its <html> element.');
	context.documentProbe = false;
}

/** Resets root-document probing before an isolated component attempt. */
export function resetDocumentProbe(context: SsrContext): void {
	context.documentDoctypeSeen = false;
	context.documentOutputs = undefined;
	context.documentProbe = true;
	context.documentRootSeen = false;
	context.documentHeadSeen = false;
	context.documentBodySeen = false;
	context.hostStack.length = 0;
}

/** Serializes one compiler-authorized raw HTML operation. */
export function renderUnsafeHtmlValue(context: SsrContext, value: unknown): string {
	if (!context.allowUnsafeHtml)
		throw new Error('unsafeHtml() requires allowUnsafeHtml: true on the native eXact SSR root.');
	const html = String(unwrap(value) ?? '');
	context.onUnsafeHtml?.({ characters: html.length });
	return html;
}

/** Serializes the scalar-only contents of script and style intrinsics. */
export function primitiveText(children: readonly Child[]): string {
	let output = '';
	for (const child of children) {
		const value = unwrap(child);
		if (value === null || value === undefined || value === false || value === true) continue;
		if (typeof value === 'object' || typeof value === 'function')
			throw new TypeError('Text-only intrinsic content requires scalar compiler output');
		output += String(value);
	}
	return output;
}
