import { createVNode, type ComponentFunction } from '@exactjs/core';
import { createExactCompatibilityArtifact } from '@exactjs/core/framework/runtime-component-artifacts';
import type { ReactNode } from '@exactjs/react-compat';
import {
	ReactCacheContext,
	ReactRootContext,
	reactCompatibilityTarget,
	toExactNode,
	type ReactCacheScope,
	type ReactRootRuntime
} from '@exactjs/react-compat/exact';
import {
	renderToString as renderExactToString,
	renderToStringAsync as renderExactToStringAsync
} from '@exactjs/ssr';
import '@exactjs/ssr/runtime/generic-components';

/** Configures server render. */
export interface ServerRenderOptions {
	identifierPrefix?: string;
	signal?: AbortSignal;
	bootstrapScriptContent?: string;
	bootstrapScripts?: readonly string[];
	bootstrapModules?: readonly string[];
	nonce?: string;
	onError?: (error: unknown, errorInfo?: { componentStack?: string }) => string | void;
}

type ServerRootProps = {
	node: ReactNode;
	options: ServerRenderOptions;
	resources: Map<string, { priority: number; html: string }>;
};
const ServerRoot = function ExactReactServerRoot(
	this: import('@exactjs/core').Component<Record<string, never>>,
	props: ServerRootProps
) {
	const scope: ReactCacheScope = { roots: new Map(), controller: new AbortController() };
	const runtime: ReactRootRuntime = {
		identifierPrefix: props.options.identifierPrefix ?? '',
		nextComponentId: 0,
		resources: props.resources
	};
	this.setContext(ReactCacheContext, scope);
	this.setContext(ReactRootContext, runtime);
	this.onUnmount(() =>
		scope.controller.abort(new DOMException('React server cache request completed', 'AbortError'))
	);
	return () => toExactNode(props.node);
} as ComponentFunction<Record<string, never>, ServerRootProps>;
createExactCompatibilityArtifact(ServerRoot, '@exactjs/react-dom-compat:ServerRoot', 'server');

function serverVNode(
	node: ReactNode,
	options: ServerRenderOptions,
	resources: Map<string, { priority: number; html: string }>
) {
	return createVNode(ServerRoot, { node, options, resources });
}

/** Transforms react to string into its required representation. */
export function renderReactToString(
	node: ReactNode,
	options: ServerRenderOptions = {},
	textSeparators = true
): string {
	try {
		const resources = new Map<string, { priority: number; html: string }>();
		const html = renderExactToString(serverVNode(node, options, resources), {
			markers: false,
			reactMarkup: reactCompatibilityTarget(),
			textSeparators,
			signal: options.signal
		}).html;
		return `${renderResourceHints(resources)}${html}`;
	} catch (error) {
		options.onError?.(error, { componentStack: '' });
		throw error;
	}
}

/** Transforms react to string async into its required representation. */
export async function renderReactToStringAsync(
	node: ReactNode,
	options: ServerRenderOptions = {},
	textSeparators = true
): Promise<string> {
	try {
		const resources = new Map<string, { priority: number; html: string }>();
		const html = (
			await renderExactToStringAsync(serverVNode(node, options, resources), {
				markers: false,
				reactMarkup: reactCompatibilityTarget(),
				textSeparators,
				signal: options.signal
			})
		).html;
		return `${renderResourceHints(resources)}${html}`;
	} catch (error) {
		options.onError?.(error, { componentStack: '' });
		throw error;
	}
}

function renderResourceHints(resources: Map<string, { priority: number; html: string }>): string {
	return [...resources.values()]
		.sort((left, right) => left.priority - right.priority)
		.map((resource) => resource.html)
		.join('');
}

/** Performs the readable stream from string domain operation. */
export function readableStreamFromString(html: string): ReadableStream<Uint8Array> {
	const bytes = new TextEncoder().encode(html);
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		}
	});
}

/** Transforms to readable stream into its required representation. */
export async function renderToReadableStream(
	node: ReactNode,
	options: ServerRenderOptions = {}
): Promise<ReadableStream<Uint8Array> & { allReady: Promise<void> }> {
	const html = withBootstrapScripts(await renderReactToStringAsync(node, options), options);
	const stream = readableStreamFromString(html) as ReadableStream<Uint8Array> & {
		allReady: Promise<void>;
	};
	Object.defineProperty(stream, 'allReady', { configurable: true, value: Promise.resolve() });
	return stream;
}

/** Performs the with bootstrap scripts domain operation. */
export function withBootstrapScripts(html: string, options: ServerRenderOptions): string {
	const scripts = options.bootstrapScripts ?? [];
	const modules = options.bootstrapModules ?? [];
	const nonce = options.nonce === undefined ? '' : ` nonce="${escapeHtmlAttribute(options.nonce)}"`;
	const target = reactCompatibilityTarget();
	const preloads =
		target === 19
			? [
					...scripts.map(
						(src) =>
							`<link rel="preload" as="script" fetchPriority="low"${nonce} href="${escapeHtmlAttribute(src)}"/>`
					),
					...modules.map(
						(src) =>
							`<link rel="modulepreload" fetchPriority="low"${nonce} href="${escapeHtmlAttribute(src)}"/>`
					)
				].join('')
			: '';
	const inline =
		options.bootstrapScriptContent === undefined
			? ''
			: `<script${nonce}${target === 19 ? ' id="_R_"' : ''}>${escapeInlineScript(options.bootstrapScriptContent)}</script>`;
	const externalNonce = target === 19 ? nonce : '';
	const suffix = [
		inline,
		...scripts.map(
			(src) => `<script src="${escapeHtmlAttribute(src)}"${externalNonce} async=""></script>`
		),
		...modules.map(
			(src) =>
				`<script type="module" src="${escapeHtmlAttribute(src)}"${externalNonce} async=""></script>`
		)
	].join('');
	return `${preloads}${html}${suffix}`;
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function escapeInlineScript(value: string): string {
	return value.replace(/<\/(script)/gi, '<\\/$1');
}

/** Transforms to string into its required representation. */
export function renderToString(node: ReactNode, options?: ServerRenderOptions): string {
	return renderReactToString(node, options);
}

/** Transforms to static markup into its required representation. */
export function renderToStaticMarkup(node: ReactNode, options?: ServerRenderOptions): string {
	return renderReactToString(node, options, false);
}
