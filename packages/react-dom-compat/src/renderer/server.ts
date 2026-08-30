import type { AnyReactComponentType, ReactElement, ReactNode } from '@exactjs/react-compat';
import {
	constructReactServerRendererComponent,
	createReactRendererRootContexts,
	disposeReactRendererComponent,
	exactComponentType,
	isReactElement,
	isReactPortal,
	readReactRendererSuspension,
	renderReactRendererComponent,
	ReactCacheContext,
	REACT_ACTIVITY_TYPE,
	REACT_FRAGMENT_TYPE,
	REACT_PROFILER_TYPE,
	REACT_STRICT_MODE_TYPE,
	type ReactCacheScope,
	type ReactRendererComponentInstance,
	type ReactRootRuntime
} from '@exactjs/react-compat/exact';
import type { ComponentContextValues } from '@exactjs/core';
import type { ServerRenderOptions } from '../server/shared.js';
import {
	dangerousHtml,
	escapeText,
	isTextNode,
	recordImagePreload,
	renderAttributes,
	selectChildren,
	voidElements,
	withoutProps
} from './server-markup.js';

type ServerContext = {
	options: ServerRenderOptions;
	contexts: ComponentContextValues;
	resources: Map<string, { priority: number; html: string }>;
};

/** Serializes one React-owned tree synchronously without entering eXact SSR dispatch. */
export function renderReactServerTree(
	node: ReactNode,
	options: ServerRenderOptions,
	textSeparators: boolean
): { html: string; resources: Map<string, { priority: number; html: string }> } {
	const context = createServerContext(options);
	try {
		return {
			html: renderNodeSync(context, node, undefined, textSeparators),
			resources: context.resources
		};
	} finally {
		disposeServerContext(context);
	}
}

/** Serializes one React-owned tree while awaiting Suspense and async component work. */
export async function renderReactServerTreeAsync(
	node: ReactNode,
	options: ServerRenderOptions,
	textSeparators: boolean
): Promise<{ html: string; resources: Map<string, { priority: number; html: string }> }> {
	const context = createServerContext(options);
	try {
		return {
			html: await renderNodeAsync(context, node, undefined, textSeparators),
			resources: context.resources
		};
	} finally {
		disposeServerContext(context);
	}
}

function createServerContext(options: ServerRenderOptions): ServerContext {
	const resources = new Map<string, { priority: number; html: string }>();
	const runtime: ReactRootRuntime = {
		identifierPrefix: options.identifierPrefix ?? '',
		nextComponentId: 0,
		resources
	};
	const contexts = new Map<symbol, unknown>(createReactRendererRootContexts(runtime));
	const cache: ReactCacheScope = { roots: new Map(), controller: new AbortController() };
	contexts.set(ReactCacheContext.id, cache);
	return { options, contexts, resources };
}

function disposeServerContext(context: ServerContext): void {
	const cache = context.contexts.get(ReactCacheContext.id) as ReactCacheScope | undefined;
	cache?.controller.abort(new DOMException('React server cache request completed', 'AbortError'));
}

function renderNodeSync(
	context: ServerContext,
	node: ReactNode,
	parent: ReactRendererComponentInstance | undefined,
	textSeparators: boolean
): string {
	assertNotAborted(context.options.signal);
	if (Array.isArray(node)) return renderArraySync(context, node, parent, textSeparators);
	if (node === null || node === undefined || typeof node === 'boolean') return '';
	if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint')
		return escapeText(String(node));
	if (node instanceof Promise) throw node;
	if (isReactPortal(node)) return '';
	if (!isReactElement(node))
		throw new TypeError(
			`Objects are not valid as a React child (${Object.prototype.toString.call(node)})`
		);
	return renderElementSync(context, node, parent, textSeparators);
}

async function renderNodeAsync(
	context: ServerContext,
	node: ReactNode,
	parent: ReactRendererComponentInstance | undefined,
	textSeparators: boolean
): Promise<string> {
	assertNotAborted(context.options.signal);
	if (node instanceof Promise)
		return renderNodeAsync(
			context,
			(await Promise.resolve(node as PromiseLike<unknown>)) as ReactNode,
			parent,
			textSeparators
		);
	if (Array.isArray(node)) return renderArrayAsync(context, node, parent, textSeparators);
	if (node === null || node === undefined || typeof node === 'boolean') return '';
	if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint')
		return escapeText(String(node));
	if (isReactPortal(node)) return '';
	if (!isReactElement(node))
		throw new TypeError(
			`Objects are not valid as a React child (${Object.prototype.toString.call(node)})`
		);
	return renderElementAsync(context, node, parent, textSeparators);
}

function renderElementSync(
	context: ServerContext,
	element: ReactElement,
	parent: ReactRendererComponentInstance | undefined,
	textSeparators: boolean
): string {
	const props = element.props as Record<string, unknown>;
	if (typeof element.type === 'string')
		return renderHostSync(context, element.type, props, parent, textSeparators);
	if (element.type === REACT_FRAGMENT_TYPE || element.type === REACT_STRICT_MODE_TYPE)
		return renderNodeSync(context, props.children as ReactNode, parent, textSeparators);
	if (element.type === REACT_ACTIVITY_TYPE && props.mode === 'hidden') return '';
	if (exactComponentType(element.type))
		throw new TypeError('Native eXact boundaries require an opaque compatibility contribution');
	return renderComponentSync(
		context,
		element.type === REACT_PROFILER_TYPE ? REACT_PROFILER_TYPE : element.type,
		props,
		parent,
		textSeparators
	);
}

async function renderElementAsync(
	context: ServerContext,
	element: ReactElement,
	parent: ReactRendererComponentInstance | undefined,
	textSeparators: boolean
): Promise<string> {
	const props = element.props as Record<string, unknown>;
	if (typeof element.type === 'string')
		return renderHostAsync(context, element.type, props, parent, textSeparators);
	if (element.type === REACT_FRAGMENT_TYPE || element.type === REACT_STRICT_MODE_TYPE)
		return renderNodeAsync(context, props.children as ReactNode, parent, textSeparators);
	if (element.type === REACT_ACTIVITY_TYPE && props.mode === 'hidden') return '';
	if (exactComponentType(element.type))
		throw new TypeError('Native eXact boundaries require an opaque compatibility contribution');
	return renderComponentAsync(
		context,
		element.type === REACT_PROFILER_TYPE ? REACT_PROFILER_TYPE : element.type,
		props,
		parent,
		textSeparators
	);
}

function renderComponentSync(
	context: ServerContext,
	type: ReactElement['type'],
	props: Record<string, unknown>,
	parent: ReactRendererComponentInstance | undefined,
	textSeparators: boolean
): string {
	if (typeof type === 'string') throw new TypeError('Host element entered component serialization');
	const instance = constructReactServerRendererComponent(
		type as AnyReactComponentType | symbol,
		props,
		parent,
		context.contexts
	);
	try {
		const output = renderReactRendererComponent(instance, () => undefined);
		const rendered = renderNodeSync(context, output, instance, textSeparators);
		const suspension = readReactRendererSuspension(instance);
		return suspension?.suspended
			? renderNodeSync(context, props.fallback as ReactNode, parent, textSeparators)
			: rendered;
	} finally {
		disposeReactRendererComponent(instance);
	}
}

async function renderComponentAsync(
	context: ServerContext,
	type: ReactElement['type'],
	props: Record<string, unknown>,
	parent: ReactRendererComponentInstance | undefined,
	textSeparators: boolean
): Promise<string> {
	if (typeof type === 'string') throw new TypeError('Host element entered component serialization');
	const instance = constructReactServerRendererComponent(
		type as AnyReactComponentType | symbol,
		props,
		parent,
		context.contexts
	);
	try {
		let output = renderReactRendererComponent(instance, () => undefined);
		let rendered = await renderNodeAsync(context, output, instance, textSeparators);
		const suspension = readReactRendererSuspension(instance);
		if (suspension?.suspended && suspension.promise) {
			await waitForSuspense(suspension.promise, context.options.signal);
			output = renderReactRendererComponent(instance, () => undefined);
			rendered = await renderNodeAsync(context, output, instance, textSeparators);
		}
		return rendered;
	} finally {
		disposeReactRendererComponent(instance);
	}
}

function renderHostSync(
	context: ServerContext,
	tag: string,
	props: Record<string, unknown>,
	parent: ReactRendererComponentInstance | undefined,
	textSeparators: boolean
): string {
	recordImagePreload(context, tag, props);
	if (tag === 'textarea')
		return `<textarea${renderAttributes(withoutProps(props, 'defaultValue', 'value'), tag)}>${escapeText(String(props.value ?? props.defaultValue ?? props.children ?? ''))}</textarea>`;
	const hostProps =
		tag === 'select'
			? withoutProps(props, 'value', 'defaultValue')
			: tag === 'input'
				? inputHostProps(props)
				: props;
	const attributes = renderAttributes(hostProps, tag);
	if (voidElements.has(tag)) return `<${tag}${attributes}/>`;
	const inner =
		dangerousHtml(props) ??
		renderNodeSync(
			context,
			tag === 'select'
				? selectChildren(props.children as ReactNode, props.value ?? props.defaultValue)
				: (props.children as ReactNode),
			parent,
			textSeparators
		);
	return `<${tag}${attributes}>${inner}</${tag}>`;
}

async function renderHostAsync(
	context: ServerContext,
	tag: string,
	props: Record<string, unknown>,
	parent: ReactRendererComponentInstance | undefined,
	textSeparators: boolean
): Promise<string> {
	recordImagePreload(context, tag, props);
	if (tag === 'textarea')
		return `<textarea${renderAttributes(withoutProps(props, 'defaultValue', 'value'), tag)}>${escapeText(String(props.value ?? props.defaultValue ?? props.children ?? ''))}</textarea>`;
	const hostProps =
		tag === 'select'
			? withoutProps(props, 'value', 'defaultValue')
			: tag === 'input'
				? inputHostProps(props)
				: props;
	const attributes = renderAttributes(hostProps, tag);
	if (voidElements.has(tag)) return `<${tag}${attributes}/>`;
	const inner =
		dangerousHtml(props) ??
		(await renderNodeAsync(
			context,
			tag === 'select'
				? selectChildren(props.children as ReactNode, props.value ?? props.defaultValue)
				: (props.children as ReactNode),
			parent,
			textSeparators
		));
	return `<${tag}${attributes}>${inner}</${tag}>`;
}

function inputHostProps(props: Record<string, unknown>): Record<string, unknown> {
	const result = withoutProps(props, 'defaultChecked', 'defaultValue');
	if ('defaultChecked' in props) result.checked = props.defaultChecked;
	if ('defaultValue' in props) result.value = props.defaultValue;
	return result;
}

function renderArraySync(
	context: ServerContext,
	children: readonly ReactNode[],
	parent: ReactRendererComponentInstance | undefined,
	textSeparators: boolean
): string {
	let html = '';
	let previousText = false;
	for (const child of children) {
		const text = isTextNode(child);
		const rendered = renderNodeSync(context, child, parent, textSeparators);
		if (textSeparators && text && previousText && rendered) html += '<!-- -->';
		html += rendered;
		previousText = text && rendered !== '';
	}
	return html;
}

async function renderArrayAsync(
	context: ServerContext,
	children: readonly ReactNode[],
	parent: ReactRendererComponentInstance | undefined,
	textSeparators: boolean
): Promise<string> {
	let html = '';
	let previousText = false;
	for (const child of children) {
		const text = isTextNode(child);
		const rendered = await renderNodeAsync(context, child, parent, textSeparators);
		if (textSeparators && text && previousText && rendered) html += '<!-- -->';
		html += rendered;
		previousText = text && rendered !== '';
	}
	return html;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

function waitForSuspense(
	promise: PromiseLike<unknown>,
	signal: AbortSignal | undefined
): Promise<void> {
	if (!signal) return Promise.resolve(promise).then(() => undefined);
	assertNotAborted(signal);
	return new Promise<void>((resolve, reject) => {
		const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
		signal.addEventListener('abort', abort, { once: true });
		void Promise.resolve(promise).then(
			() => {
				signal.removeEventListener('abort', abort);
				resolve();
			},
			(error) => {
				signal.removeEventListener('abort', abort);
				reject(error);
			}
		);
	});
}
