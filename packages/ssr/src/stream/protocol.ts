import { inheritRequestRenderScheduler } from '@exactjs/server/framework/render-scheduling';
import { attemptCleanup, createCleanupFailure, throwCleanupFailure } from '@exactjs/core';
import { findDocumentBodyClose, isExactDocumentHtml } from '../document.js';
import { escapeAttr } from '../html.js';
import { documentHydrationSlot, fillDocumentHydration } from '../render/document-output.js';
import type {
	ExactDocumentStreamEvent,
	ExactResponseLike,
	RenderToProgressiveHtmlResponseOptions,
	RenderToProgressiveHtmlStreamOptions
} from '../types.js';

/** Shared wire-limit normalization used by progressive stream framing. */
export { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';

/** Runs all stream cleanup callbacks while retaining the first failure as the primary error. */
export function cleanupAll(...callbacks: Array<() => void>): void {
	const failure = createCleanupFailure();
	for (const callback of callbacks) attemptCleanup(failure, callback);
	throwCleanupFailure(failure);
}

/** Forwards cancellation from the request signal into the progressive render controller. */
export function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
	inheritRequestRenderScheduler(source, target.signal);
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
	return {
		status: options.status ?? 200,
		headers: progressiveHtmlResponseHeaders(options),
		body: '',
		stream
	};
}

/** Builds the shared progressive response headers without selecting a body adapter. */
export function progressiveHtmlResponseHeaders(
	options: RenderToProgressiveHtmlResponseOptions
): Record<string, string> {
	const headers = { ...options.headers };
	if (options.contentType !== undefined || !hasHeader(headers, 'content-type'))
		setHeader(headers, 'content-type', options.contentType ?? 'text/html; charset=utf-8');
	return headers;
}

/** Tracks the state owned by progressive document. */
export type ProgressiveDocumentState = {
	head?: string;
	tail?: string;
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
		case 'head':
			document.head = event.html;
			return event.html;
		case 'body':
			return event.html;
		case 'shell': {
			if (event.streamed) {
				document.head = undefined;
				document.tail = event.html;
				return '';
			}
			if (isExactDocumentHtml(event.html)) {
				const slot = event.html.indexOf(documentHydrationSlot);
				const bodyClose = slot >= 0 ? slot : findDocumentBodyClose(event.html);
				if (bodyClose < 0)
					throw new Error(
						'Normalized eXact document output is missing its closing </body> element.'
					);
				document.tail = event.html.slice(bodyClose);
				const head = document.head ?? '';
				if (!event.html.startsWith(head))
					throw new Error('A published document head changed during task settlement.');
				document.head = undefined;
				return event.html.slice(head.length, bodyClose);
			}
			return `<div id="${escapeAttr(progressiveRootId(options))}">${event.html}</div>`;
		}
		case 'replace':
			if (document.tail !== undefined)
				throw new Error('A published full document shell cannot be replaced.');
			return scopedReplacementScript(event.id, event.html, options, document);
		case 'hydration':
			if (document.tail !== undefined) {
				document.hydration = event.html;
				return '';
			}
			return event.html;
		case 'complete':
			if (document.tail !== undefined) {
				// The shell is already published. Batch the final framework region and
				// closing tags into one write without delaying resource discovery.
				const tail = document.tail.includes(documentHydrationSlot)
					? fillDocumentHydration(document.tail, document.hydration ?? '')
					: document.hydration
						? `<!--exact:framework-body:start-->${document.hydration}<!--exact:framework-body:end-->${document.tail}`
						: document.tail;
				document.tail = undefined;
				document.hydration = undefined;
				return tail;
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
