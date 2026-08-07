import { attemptCleanup, createCleanupFailure, throwCleanupFailure } from '@exactjs/core';
import { augmentDocumentBody, isExactDocumentHtml } from '../document.js';
import { escapeAttr } from '../html.js';
import type {
	ExactDocumentStreamEvent,
	ExactResponseLike,
	RenderToProgressiveHtmlResponseOptions,
	RenderToProgressiveHtmlStreamOptions
} from '../types.js';

/** Performs the positive limit domain operation. */
export function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Runs all stream cleanup callbacks while retaining the first failure as the primary error. */
export function cleanupAll(...callbacks: Array<() => void>): void {
	const failure = createCleanupFailure();
	for (const callback of callbacks) attemptCleanup(failure, callback);
	throwCleanupFailure(failure);
}

/** Forwards cancellation from the request signal into the progressive render controller. */
export function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
	if (!source) return () => undefined;
	const abort = () => target.abort(source.reason);
	if (source.aborted) abort();
	else source.addEventListener('abort', abort, { once: true });
	return () => source.removeEventListener('abort', abort);
}

/** Creates the progressive HTML response and owns cancellation until its stream is closed. */
export function progressiveHtmlResponse(
	stream: ReadableStream<Uint8Array>,
	options: RenderToProgressiveHtmlResponseOptions
): ExactResponseLike {
	const headers = {
		...options.headers
	};
	if (options.contentType !== undefined || !hasHeader(headers, 'content-type')) {
		setHeader(headers, 'content-type', options.contentType ?? 'text/html; charset=utf-8');
	}
	return {
		status: options.status ?? 200,
		headers,
		body: '',
		stream
	};
}

/** Tracks the state owned by progressive document. */
export type ProgressiveDocumentState = {
	html?: string;
	hydration?: string;
	replacementHelper?: string;
	helperEmitted?: boolean;
};

/** Encodes one progressive HTML payload with the protocol framing expected by hydration. */
export function progressiveHtmlChunk(
	event: ExactDocumentStreamEvent,
	options: RenderToProgressiveHtmlStreamOptions,
	document: ProgressiveDocumentState
): string {
	switch (event.event) {
		case 'start':
			return '';
		case 'shell': {
			if (isExactDocumentHtml(event.html)) {
				document.html = event.html;
				return '';
			}
			return `<div id="${escapeAttr(progressiveRootId(options))}">${event.html}</div>`;
		}
		case 'replace':
			if (document.html !== undefined) {
				document.html = event.html;
				return '';
			}
			return scopedReplacementScript(event.id, event.html, options, document);
		case 'hydration':
			if (document.html !== undefined) {
				document.hydration = event.html;
				return '';
			}
			return event.html;
		case 'complete':
			if (document.html !== undefined) {
				const html = augmentDocumentBody(document.html, document.hydration ?? '');
				document.html = undefined;
				document.hydration = undefined;
				return html;
			}
			return '';
		case 'error':
			return inlineScript(`console.error("eXact document stream failed");`, options);
	}
}

/** Performs the progressive root id domain operation. */
export function progressiveRootId(options: RenderToProgressiveHtmlStreamOptions): string {
	return options.rootId ?? 'exact-root';
}

/** Reports whether header. */
export function hasHeader(headers: Record<string, string>, name: string): boolean {
	return Object.keys(headers).some((header) => header.toLowerCase() === name);
}

/** Applies a header to the owned runtime state. */
export function setHeader(headers: Record<string, string>, name: string, value: string): void {
	const existing = Object.keys(headers).find((header) => header.toLowerCase() === name);
	if (existing) {
		headers[existing] = value;
	} else {
		headers[name] = value;
	}
}

/** Serializes a progressive-render failure into a safe inline client notification script. */
export function progressiveErrorScript(
	error: unknown,
	options: RenderToProgressiveHtmlStreamOptions
): string {
	if (options.progressiveMode === 'inert') {
		return `<template data-exact-progressive-error="true"></template>`;
	}
	return inlineScript(`console.error("eXact document stream failed");`, options);
}

/** Emits the script that replaces one resolved server boundary without touching sibling ranges. */
export function scopedReplacementScript(
	id: string,
	html: string,
	options: RenderToProgressiveHtmlStreamOptions,
	documentState?: ProgressiveDocumentState
): string {
	if (options.progressiveMode === 'inert') {
		const payload = JSON.stringify({ version: 1, operation: 'replace', id, html });
		return `<template data-exact-progressive-payload="${escapeAttr(payload)}"></template>`;
	}
	const rootId = inlineJsonString(progressiveRootId(options));
	const targetId = inlineJsonString(id);
	const content = inlineJsonString(html);
	if (documentState) {
		const helper = (documentState.replacementHelper ??= progressiveHelperName(
			progressiveRootId(options)
		));
		const reference = helper;
		const call = `${reference}(${targetId},${content});`;
		if (documentState.helperEmitted) return inlineScript(call, options);
		documentState.helperEmitted = true;
		const install = `globalThis.${reference}=function(i,h){var r=document.getElementById(${rootId});if(!r||r.getAttribute("data-exact-hydrated")==="true"){delete globalThis.${reference};return}var e=document.getElementById(i),t=document.createElement("template");t.innerHTML=h;if(e&&(e===r||r.contains(e)))e.replaceChildren(t.content);else{var w=document.createTreeWalker(r,128),s=null,n;while(n=w.nextNode())if(n.data==="exact:"+i){s=n;break}if(s){var p=s.parentNode,x=s;while(x&&!(x.nodeType===8&&x.data==="/exact:"+i))x=x.nextSibling;if(x){var a=x.nextSibling;p.insertBefore(t.content,s);while(s!==a){var q=s.nextSibling;p.removeChild(s);s=q}}}}};`;
		return inlineScript(install + call, options);
	}
	return inlineScript(
		`var r=document.getElementById(${rootId});if(r&&r.getAttribute("data-exact-hydrated")!=="true"){var i=${targetId},e=document.getElementById(i),t=document.createElement("template");t.innerHTML=${content};if(e&&(e===r||r.contains(e)))e.replaceChildren(t.content);else{var w=document.createTreeWalker(r,128),s=null,n;while(n=w.nextNode())if(n.data==="exact:"+i){s=n;break}if(s){var p=s.parentNode,x=s;while(x&&!(x.nodeType===8&&x.data==="/exact:"+i))x=x.nextSibling;if(x){var a=x.nextSibling;p.insertBefore(t.content,s);while(s!==a){var q=s.nextSibling;p.removeChild(s);s=q}}}}}`,
		options
	);
}

function progressiveHelperName(rootId: string): string {
	let hash = 2166136261;
	for (let index = 0; index < rootId.length; index++) {
		hash ^= rootId.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `__xR${(hash >>> 0).toString(36)}`;
}

/** Performs the inline script domain operation. */
export function inlineScript(body: string, options: RenderToProgressiveHtmlStreamOptions): string {
	const nonce = options.nonce === undefined ? '' : ` nonce="${escapeAttr(options.nonce)}"`;
	return `<script${nonce}>${body}</script>`;
}

/** Performs the inline json string domain operation. */
export function inlineJsonString(value: string): string {
	return JSON.stringify(value)
		.replace(/</g, '\\u003C')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}
