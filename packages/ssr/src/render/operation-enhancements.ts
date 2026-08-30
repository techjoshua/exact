import {
	isExactEnhancementPassThrough,
	logFrameworkEvent,
	type AnyComponentInstance,
	type Child,
	type CompiledEnhancementNode
} from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { readPreparedExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import type { RenderToStringOptions, SsrContext } from '../types.js';
import {
	createDeferredSerializedSsrHtmlOperation,
	createSerializedSsrHtmlOperation
} from './serialized-html-operation.js';

type SyncChildren = (
	context: SsrContext,
	children: readonly Child[],
	parent?: AnyComponentInstance,
	hasComponentAncestor?: boolean
) => string;

type AsyncChildren = (
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor?: boolean
) => Promise<string>;

/** Applies one operation's enhancement declaration without exposing or rebuilding its topology. */
export function renderOperationEnhancements(
	context: SsrContext,
	enhancement: CompiledEnhancementNode | undefined,
	renderPlain: () => string,
	parent: AnyComponentInstance | undefined,
	renderChildren: SyncChildren,
	plainOperation?: Child
): string {
	if (!enhancement) return renderPlain();
	if (enhancementUsesTargetReceipt(context, enhancement))
		return renderEnhancementOperationChain(
			context,
			enhancement,
			createDeferredSerializedSsrHtmlOperation(renderPlain),
			parent,
			renderChildren
		);
	const routed = beginRoutes(context, enhancement);
	let output: string;
	try {
		const directRoot = directRootRoute(context, enhancement);
		if (directRoot && plainOperation !== undefined) {
			directRoot.consumed = true;
			return renderEnhancementOperation(
				context,
				directRoot.identity,
				directRoot.props,
				plainOperation,
				parent,
				renderChildren
			);
		}
		markNestedRootRoute(context, enhancement);
		output =
			plainOperation === undefined
				? renderPlain()
				: renderEnhancementOperationChain(
						context,
						enhancement,
						plainOperation,
						parent,
						renderChildren
					);
	} finally {
		endRoutes(context, routed.length);
	}
	if (plainOperation !== undefined) return output;
	for (const entry of [...enhancement.entries].reverse()) {
		if (entry.root !== undefined) continue;
		const route = routed.find((candidate) => candidate.identity === entry.identity);
		if (route?.consumed) continue;
		if (route?.nested) {
			output = `${renderEnhancementComponent(context, entry.identity, entry.props, route.nestedBefore ?? '', parent, renderChildren)}${output}`;
			route.consumed = true;
		} else {
			output = renderEnhancementComponent(
				context,
				entry.identity,
				entry.props,
				output,
				parent,
				renderChildren
			);
		}
	}
	return output;
}

/** Async enhancement counterpart preserving request-local component ownership. */
export async function renderOperationEnhancementsAsync(
	context: SsrContext,
	enhancement: CompiledEnhancementNode | undefined,
	renderPlain: () => Promise<string>,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChildren: AsyncChildren,
	plainOperation?: Child
): Promise<string> {
	if (!enhancement) return renderPlain();
	if (enhancementUsesTargetReceipt(context, enhancement))
		return renderEnhancementOperationChainAsync(
			context,
			enhancement,
			createDeferredSerializedSsrHtmlOperation(renderPlain),
			parent,
			options,
			renderChildren
		);
	const routed = beginRoutes(context, enhancement);
	let output: string;
	try {
		const directRoot = directRootRoute(context, enhancement);
		if (directRoot && plainOperation !== undefined) {
			directRoot.consumed = true;
			return renderEnhancementOperationAsync(
				context,
				directRoot.identity,
				directRoot.props,
				plainOperation,
				parent,
				options,
				renderChildren
			);
		}
		markNestedRootRoute(context, enhancement);
		output =
			plainOperation === undefined
				? await renderPlain()
				: await renderEnhancementOperationChainAsync(
						context,
						enhancement,
						plainOperation,
						parent,
						options,
						renderChildren
					);
	} finally {
		endRoutes(context, routed.length);
	}
	if (plainOperation !== undefined) return output;
	for (const entry of [...enhancement.entries].reverse()) {
		if (entry.root !== undefined) continue;
		const route = routed.find((candidate) => candidate.identity === entry.identity);
		if (route?.consumed) continue;
		if (route?.nested) {
			output = `${await renderEnhancementComponentAsync(context, entry.identity, entry.props, route.nestedBefore ?? '', parent, options, renderChildren)}${output}`;
			route.consumed = true;
		} else
			output = await renderEnhancementComponentAsync(
				context,
				entry.identity,
				entry.props,
				output,
				parent,
				options,
				renderChildren
			);
	}
	return output;
}

/** Publishes route cut points declared by this operation to its active ancestor enhancements. */
function beginRoutes(
	context: SsrContext,
	enhancement: CompiledEnhancementNode
): NonNullable<SsrContext['enhancementOperationRoutes']> {
	const routes = enhancement.entries
		.filter((entry) => entry.root === undefined)
		.map((entry) => ({
			identity: entry.identity,
			props: entry.props,
			componentDepth: context.enhancementOperationComponentDepth ?? 0,
			consumed: false,
			nested: false
		}));
	if (!routes.length) return [];
	(context.enhancementOperationRoutes ??= []).push(...routes);
	return routes;
}

function endRoutes(context: SsrContext, count: number): void {
	if (count) context.enhancementOperationRoutes!.splice(-count, count);
}

function directRootRoute(context: SsrContext, enhancement: CompiledEnhancementNode) {
	const roots = new Set(
		enhancement.entries.filter((entry) => entry.root === true).map((entry) => entry.identity)
	);
	const depth = context.enhancementOperationComponentDepth ?? 0;
	return [...(context.enhancementOperationRoutes ?? [])]
		.reverse()
		.find(
			(route) => !route.consumed && route.componentDepth === depth && roots.has(route.identity)
		);
}

function markNestedRootRoute(context: SsrContext, enhancement: CompiledEnhancementNode): void {
	const roots = new Set(
		enhancement.entries.filter((entry) => entry.root === true).map((entry) => entry.identity)
	);
	const depth = context.enhancementOperationComponentDepth ?? 0;
	const route = [...(context.enhancementOperationRoutes ?? [])]
		.reverse()
		.find(
			(candidate) =>
				!candidate.consumed && candidate.componentDepth < depth && roots.has(candidate.identity)
		);
	if (route) route.nested = true;
}

/** Captures the already-rendered sibling prefix when a nested component reports a route root. */
export function captureNestedEnhancementPrefix(context: SsrContext, html: string[]): void {
	const depth = context.enhancementOperationComponentDepth ?? 0;
	for (const route of context.enhancementOperationRoutes ?? []) {
		if (!route.nested || route.consumed || route.nestedBefore !== undefined) continue;
		if (route.componentDepth !== depth) continue;
		// A nested renderer may report the route before its containing compiled program has
		// appended the preceding static segment. Leave the cut unclaimed until that owner can
		// contribute an actual prefix.
		if (html.length === 0) continue;
		route.nestedBefore = html.join('');
		html.length = 0;
	}
}

/** Transfers one accumulated string prefix to the first pending nested enhancement route. */
export function captureNestedEnhancementStringPrefix(context: SsrContext, html: string): string {
	if (html === '') return html;
	const depth = context.enhancementOperationComponentDepth ?? 0;
	for (const route of context.enhancementOperationRoutes ?? []) {
		if (!route.nested || route.consumed || route.nestedBefore !== undefined) continue;
		if (route.componentDepth !== depth) continue;
		route.nestedBefore = html;
		return '';
	}
	return html;
}

function renderEnhancementComponent(
	context: SsrContext,
	identity: string,
	props: Readonly<Record<string, unknown>>,
	html: string,
	parent: AnyComponentInstance | undefined,
	renderChildren: SyncChildren
): string {
	const component = enhancementComponent(context, identity);
	if (!component || isExactEnhancementPassThrough(component)) return html;
	return renderChildren(
		context,
		[
			createCompiledComponentReceipt(
				component,
				{ ...props },
				createSerializedSsrHtmlOperation(html)
			)
		],
		parent,
		true
	);
}

function renderEnhancementOperation(
	context: SsrContext,
	identity: string,
	props: Readonly<Record<string, unknown>>,
	operation: Child,
	parent: AnyComponentInstance | undefined,
	renderChildren: SyncChildren
): string {
	const component = enhancementComponent(context, identity);
	if (!component || isExactEnhancementPassThrough(component))
		return renderChildren(context, [operation], parent, true);
	return renderChildren(
		context,
		[createCompiledComponentReceipt(component, { ...props }, operation)],
		parent,
		true
	);
}

async function renderEnhancementOperationAsync(
	context: SsrContext,
	identity: string,
	props: Readonly<Record<string, unknown>>,
	operation: Child,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChildren: AsyncChildren
): Promise<string> {
	const component = enhancementComponent(context, identity);
	const child =
		!component || isExactEnhancementPassThrough(component)
			? operation
			: createCompiledComponentReceipt(component, { ...props }, operation);
	return renderChildren(context, [child], parent, options, true);
}

function renderEnhancementOperationChain(
	context: SsrContext,
	enhancement: CompiledEnhancementNode,
	leaf: Child,
	parent: AnyComponentInstance | undefined,
	renderChildren: SyncChildren
): string {
	let chain = leaf;
	for (const entry of [...enhancement.entries].reverse()) {
		if (entry.root !== undefined) continue;
		const component = enhancementComponent(context, entry.identity);
		if (!component || isExactEnhancementPassThrough(component)) continue;
		chain = createCompiledComponentReceipt(component, { ...entry.props }, chain);
	}
	return renderChildren(context, [chain], parent, true);
}

async function renderEnhancementOperationChainAsync(
	context: SsrContext,
	enhancement: CompiledEnhancementNode,
	leaf: Child,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChildren: AsyncChildren
): Promise<string> {
	let chain = leaf;
	for (const entry of [...enhancement.entries].reverse()) {
		if (entry.root !== undefined) continue;
		const component = enhancementComponent(context, entry.identity);
		if (!component || isExactEnhancementPassThrough(component)) continue;
		chain = createCompiledComponentReceipt(component, { ...entry.props }, chain);
	}
	return renderChildren(context, [chain], parent, options, true);
}

async function renderEnhancementComponentAsync(
	context: SsrContext,
	identity: string,
	props: Readonly<Record<string, unknown>>,
	html: string,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChildren: AsyncChildren
): Promise<string> {
	const component = enhancementComponent(context, identity);
	if (!component || isExactEnhancementPassThrough(component)) return html;
	return renderChildren(
		context,
		[
			createCompiledComponentReceipt(
				component,
				{ ...props },
				createSerializedSsrHtmlOperation(html)
			)
		],
		parent,
		options,
		true
	);
}

function enhancementComponent(context: SsrContext, identity: string) {
	const component = context.enhancementCatalog?.get(identity);
	if (component) return component;
	context.unavailableEnhancements ??= new Set();
	if (!context.unavailableEnhancements.has(identity)) {
		context.unavailableEnhancements.add(identity);
		logFrameworkEvent(
			'warn',
			'ssr',
			'enhancement',
			`Optional renderer enhancement "${identity}" is unavailable`,
			undefined,
			context.logger
		);
	}
	return undefined;
}

function enhancementUsesTargetReceipt(
	context: SsrContext,
	enhancement: CompiledEnhancementNode
): boolean {
	return enhancement.entries.some((entry) => {
		const component = context.enhancementCatalog?.get(entry.identity);
		return (
			!!component &&
			!isExactEnhancementPassThrough(component) &&
			readPreparedExactServerExecutableComponentContract(component).artifact.capabilities.includes(
				'targets'
			)
		);
	});
}
