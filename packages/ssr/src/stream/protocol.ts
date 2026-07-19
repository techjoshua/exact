import { attemptCleanup, createCleanupFailure, throwCleanupFailure } from '@exact/core';
import { augmentDocumentBody, isExactDocumentHtml } from '../document.js';
import { escapeAttr } from '../html.js';
import type {
	ExactDocumentStreamEvent,
	ExactResponseLike,
	RenderToProgressiveHtmlResponseOptions,
	RenderToProgressiveHtmlStreamOptions
} from '../types.js';

export function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function cleanupAll(...actions: Array<() => void>): void {
	const failure = createCleanupFailure();
	for (const action of actions) attemptCleanup(failure, action);
	throwCleanupFailure(failure);
}

export function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
	if (!source) return () => undefined;
	const abort = () => target.abort(source.reason);
	if (source.aborted) abort();
	else source.addEventListener('abort', abort, { once: true });
	return () => source.removeEventListener('abort', abort);
}

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

export type ProgressiveDocumentState = {
	html?: string;
	hydration?: string;
};

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
			return scopedReplacementScript(event.id, event.html, options);
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

export function progressiveRootId(options: RenderToProgressiveHtmlStreamOptions): string {
	return options.rootId ?? 'exact-root';
}

export function hasHeader(headers: Record<string, string>, name: string): boolean {
	return Object.keys(headers).some((header) => header.toLowerCase() === name);
}

export function setHeader(headers: Record<string, string>, name: string, value: string): void {
	const existing = Object.keys(headers).find((header) => header.toLowerCase() === name);
	if (existing) {
		headers[existing] = value;
	} else {
		headers[name] = value;
	}
}

export function progressiveErrorScript(
	error: unknown,
	options: RenderToProgressiveHtmlStreamOptions
): string {
	if (options.progressiveMode === 'inert') {
		return `<template data-exact-progressive-error="true"></template>`;
	}
	return inlineScript(`console.error("eXact document stream failed");`, options);
}

export function scopedReplacementScript(
	id: string,
	html: string,
	options: RenderToProgressiveHtmlStreamOptions
): string {
	if (options.progressiveMode === 'inert') {
		const payload = JSON.stringify({ version: 1, operation: 'replace', id, html });
		return `<template data-exact-progressive-payload="${escapeAttr(payload)}"></template>`;
	}
	const rootId = inlineJsonString(progressiveRootId(options));
	const targetId = inlineJsonString(id);
	const content = inlineJsonString(html);
	return inlineScript(
		`var r=document.getElementById(${rootId});if(r&&r.getAttribute("data-exact-hydrated")!=="true"){var e=document.getElementById(${targetId});if(e&&(e===r||r.contains(e))){var t=document.createElement("template");t.innerHTML=${content};e.replaceChildren(t.content)}}`,
		options
	);
}

export function inlineScript(body: string, options: RenderToProgressiveHtmlStreamOptions): string {
	const nonce = options.nonce === undefined ? '' : ` nonce="${escapeAttr(options.nonce)}"`;
	return `<script${nonce}>${body}</script>`;
}

export function inlineJsonString(value: string): string {
	return JSON.stringify(value)
		.replace(/</g, '\\u003C')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}
