import {
	assertEnhancementSourceOrder,
	createFragmentEnhancementChain
} from '@exactjs/core/framework/render-structure';
import {
	isExactEnhancementPassThrough,
	readExactEnhancementContexts,
	logFrameworkEvent,
	type AnyComponentInstance,
	type Child,
	type CompiledEnhancementNode
} from '@exactjs/core';
import { readPreparedExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import {
	createCompiledComponentReceipt,
	readCompiledFragmentReceipt
} from '@exactjs/core/runtime/component-operations';
import { renderPreparedFragmentEnhancements } from './prepared-fragment-enhancements.js';
import type { RenderToStringOptions, SsrContext } from '../types.js';
import type { RenderValue } from './execution.js';
import { captureSsrProgramOutput } from './program-capture.js';
import {
	beginRoutes,
	directRootRoute,
	endRoutes,
	markNestedRootRoute
} from './operation-enhancement-routes.js';
import {
	createDeferredSerializedSsrHtmlOperation,
	createSerializedSsrHtmlOperation
} from './serialized-html-operation.js';

type RenderChildren = (
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor?: boolean
) => RenderValue<string>;

/** Renders enhancement output with request-local ownership, suspending only for pending work. */
export function renderOperationEnhancements(
	context: SsrContext,
	enhancement: CompiledEnhancementNode | undefined,
	renderPlain: () => RenderValue<string>,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChildren: RenderChildren,
	plainOperation?: Child
): RenderValue<string> {
	if (!enhancement) {
		try {
			return renderPlain();
		} catch (error) {
			return Promise.reject(error);
		}
	}
	if (context.writerSink) {
		// Target routing can move an earlier prefix. Keep this region unpublished
		// until the enhancement has determined its final order and wrappers.
		return captureSsrProgramOutput(context, () =>
			renderEnhancementRoutes(
				context,
				enhancement,
				renderPlain,
				parent,
				options,
				renderChildren,
				plainOperation
			)
		);
	}
	return renderEnhancementRoutes(
		context,
		enhancement,
		renderPlain,
		parent,
		options,
		renderChildren,
		plainOperation
	);
}

/** Owns and restores routing scope for operations carrying enhancements. */
function renderEnhancementRoutes(
	context: SsrContext,
	enhancement: CompiledEnhancementNode,
	renderPlain: () => RenderValue<string>,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChildren: RenderChildren,
	plainOperation?: Child
): RenderValue<string> {
	const isFragment = plainOperation !== undefined && !!readCompiledFragmentReceipt(plainOperation);
	// One namespace cannot violate peer ordering. A non-fragment target also needs no
	// fragment-host planning, so keep that common path free of filtered entry arrays.
	const active =
		isFragment || enhancement.entries.length > 1
			? enhancement.entries.filter((entry) => {
					const component = context.enhancementCatalog?.get(entry.identity);
					return component && !isExactEnhancementPassThrough(component) && entry.root === undefined;
				})
			: enhancement.entries;
	if (active.length > 1)
		assertEnhancementSourceOrder(active, context.enhancementCatalog ?? new Map());
	if (
		isFragment &&
		active.length &&
		active.every(
			(entry) =>
				readExactEnhancementContexts(context.enhancementCatalog!.get(entry.identity)!)
					?.transparentTarget
		)
	)
		return renderPreparedFragmentEnhancements(context, active, plainOperation, parent, options);
	if (isFragment && active.length) {
		return renderChildren(
			context,
			[createFragmentEnhancementChain(active, plainOperation, context.enhancementCatalog!)],
			parent,
			options,
			true
		);
	}
	if (enhancementUsesTargetReceipt(context, enhancement))
		return renderEnhancementOperationChain(
			context,
			enhancement,
			createDeferredSerializedSsrHtmlOperation(renderPlain),
			parent,
			options,
			renderChildren
		);
	return renderLegacyEnhancementRoutes(
		context,
		enhancement,
		renderPlain,
		parent,
		options,
		renderChildren,
		plainOperation
	);
}

/** Keeps asynchronous legacy prefix routing out of direct supplied-target placement. */
async function renderLegacyEnhancementRoutes(
	context: SsrContext,
	enhancement: CompiledEnhancementNode,
	renderPlain: () => RenderValue<string>,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChildren: RenderChildren,
	plainOperation?: Child
): Promise<string> {
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
				options,
				renderChildren
			);
		}
		markNestedRootRoute(context, enhancement);
		output =
			plainOperation === undefined
				? await renderPlain()
				: await renderEnhancementOperationChain(
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
			output = `${await renderEnhancementComponent(context, entry.identity, entry.props, route.nestedBefore ?? '', parent, options, renderChildren)}${output}`;
			route.consumed = true;
		} else
			output = await renderEnhancementComponent(
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

async function renderEnhancementOperation(
	context: SsrContext,
	identity: string,
	props: Readonly<Record<string, unknown>>,
	operation: Child,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChildren: RenderChildren
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
	options: RenderToStringOptions,
	renderChildren: RenderChildren
): RenderValue<string> {
	let chain = leaf;
	for (const entry of [...enhancement.entries].reverse()) {
		if (entry.root !== undefined) continue;
		const component = enhancementComponent(context, entry.identity);
		if (!component || isExactEnhancementPassThrough(component)) continue;
		chain = createCompiledComponentReceipt(component, { ...entry.props }, chain);
	}
	return renderChildren(context, [chain], parent, options, true);
}

async function renderEnhancementComponent(
	context: SsrContext,
	identity: string,
	props: Readonly<Record<string, unknown>>,
	html: string,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	renderChildren: RenderChildren
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
