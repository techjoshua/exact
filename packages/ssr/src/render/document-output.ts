import type { DocumentOutputKind } from '@exactjs/core/runtime/component-operations';
import { escapeAttr } from '../html.js';
import type { RenderToStringOptions, SsrContext } from '../types.js';

/** Internal deferred publication boundary, retained until request resumption capture completes. */
export const documentHydrationSlot = '<!--exact:document-hydration-->';

/** External script selected by the application's build integration. */
export type DocumentScript = Readonly<{
	src: string;
	type?: 'module' | 'classic';
	integrity?: string;
	crossOrigin?: 'anonymous' | 'use-credentials';
}>;

/** Request-local build assets consumed by explicit document output markers. */
export type DocumentAssets = Readonly<{
	styles?: readonly string[];
	headScripts?: readonly DocumentScript[];
	bootstrap?: readonly DocumentScript[];
	nonce?: string;
}>;

/** Resolves one output marker without capturing hydration state before its owner completes. */
export function renderDocumentOutput(
	context: SsrContext,
	options: RenderToStringOptions,
	kind: DocumentOutputKind
): string {
	const head = kind === 'styles' || kind === 'headScripts';
	if (context.hostStack.at(-1) !== (head ? 'head' : 'body'))
		throw new Error(`documentOutput.${kind} must be an immediate ${head ? 'head' : 'body'} child`);
	const emitted = (context.documentOutputs ??= new Set());
	if (emitted.has(kind)) throw new Error(`Duplicate documentOutput.${kind} marker`);
	emitted.add(kind);
	const assets = options.documentAssets;
	if (kind === 'styles')
		return region(
			'head',
			(assets?.styles ?? [])
				.map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}">`)
				.join('')
		);
	if (kind === 'hydrationData') return documentHydrationSlot;
	if (kind === 'bootstrap' && !emitted.has('hydrationData'))
		throw new Error('documentOutput.bootstrap must follow documentOutput.hydrationData');
	const scripts = kind === 'headScripts' ? assets?.headScripts : assets?.bootstrap;
	return region(
		head ? 'head' : 'body',
		(scripts ?? []).map((script) => scriptTag(script, assets?.nonce)).join('')
	);
}

function scriptTag(script: DocumentScript, nonce?: string): string {
	return `<script src="${escapeAttr(script.src)}"${script.type === 'classic' ? ' defer' : ' type="module"'}${nonce ? ` nonce="${escapeAttr(nonce)}"` : ''}${script.integrity ? ` integrity="${escapeAttr(script.integrity)}"` : ''}${script.crossOrigin ? ` crossorigin="${escapeAttr(script.crossOrigin)}"` : ''}></script>`;
}

function region(location: 'head' | 'body', html: string): string {
	return html
		? `<!--exact:framework-${location}:start-->${html}<!--exact:framework-${location}:end-->`
		: '';
}

/** Replaces the deferred slot after capture; legacy documents retain automatic body insertion. */
export function fillDocumentHydration(html: string, hydration: string): string {
	return html.replace(documentHydrationSlot, () => region('body', hydration));
}
