import {
	attachSuppressedCleanupFailure,
	type AnyComponentFunction,
	type AnyComponentInstance,
	type Child,
	type VNode
} from '@exactjs/core';
import type { SsrContext } from '../types.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { getComponentProps } from './component-vnode.js';
import { disposeAsyncPreservingPrimary, noPrimaryFailure } from './ownership.js';
import {
	resolveSsrComponentExecution,
	type SsrComponentExecutionBlueprint
} from './root-execution-cache.js';
import { readDirectSsrContent, renderDirectSsrContent } from './direct-component-content.js';
import {
	createDirectSsrComponentFrame,
	directSsrContextOwner,
	directSsrProps,
	inComponentDomain,
	type DirectSsrComponentFrameConstructor,
	type DirectSsrLifecycleCapability
} from './direct-component-support.js';
import type {
	DirectIssuedRender,
	DirectSsrComponentPublisher,
	DirectSsrComponentResult
} from './direct-component-contracts.js';
import {
	createDirectScheduledSsrComponent,
	disposeDirectSsrLifetime,
	disposeDirectSsrLifetimeSync,
	renderIssuedServerComponentChildren,
	takePreparedDirectScheduledSsrComponent
} from './direct-component-scheduling.js';

export type { DirectSsrComponentContent } from './direct-component-content.js';
export type {
	DirectIssuedRender,
	DirectScheduledPreparation,
	DirectScheduledSsrComponent,
	DirectSsrComponentPublisher,
	DirectSsrComponentResult,
	PreparedDirectScheduledSsrComponent
} from './direct-component-contracts.js';
export {
	createDirectScheduledSsrComponent,
	disposeDirectSsrLifetime,
	disposeDirectSsrLifetimeSync,
	renderIssuedServerComponentChildren,
	takePreparedDirectScheduledSsrComponent
} from './direct-component-scheduling.js';

/** Executes one compiler-proven direct component without entering generic component ownership. */
export async function renderDirectSsrComponentOutput<Publication>(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	renderChildren: (
		children: readonly Child[],
		parent: AnyComponentInstance | undefined
	) => Promise<string>,
	renderOwnedComponent: (
		component: VNode,
		parent: AnyComponentInstance | undefined
	) => Promise<string>,
	publish: DirectSsrComponentPublisher<Publication>,
	publication: Publication
): Promise<string | undefined> {
	const blueprint = resolveSsrComponentExecution(context, vnode.type as AnyComponentFunction);
	const rawProps = getComponentProps(vnode);
	const scheduled = await (takePreparedDirectScheduledSsrComponent(context, vnode) ??
		createDirectScheduledSsrComponent(context, blueprint, rawProps, parent, options));
	if (scheduled) {
		const constructionCheckpoint = context.onComponentAttemptCheckpoint?.();
		try {
			context.onDirectComponentCreated?.(scheduled.snapshot);
			const maxPasses = context.maxTaskPasses;
			for (let pass = 0; pass < maxPasses; pass++) {
				const renderCheckpoint = context.onComponentAttemptCheckpoint?.();
				const issued = await scheduled.render();
				let renderPrimary: unknown = noPrimaryFailure;
				try {
					const html = await renderDirectSsrContent(
						context,
						issued.content,
						scheduled.owner,
						renderChildren,
						renderOwnedComponent
					);
					if (await scheduled.drain()) {
						context.onComponentAttemptRollback?.(renderCheckpoint);
						continue;
					}
					const output = publish(
						context,
						vnode,
						parent,
						html,
						scheduled.props,
						scheduled.snapshot,
						publication
					);
					context.onDirectComponentRendered?.(scheduled.snapshot);
					return output;
				} catch (error) {
					renderPrimary = error;
					context.onComponentAttemptRollback?.(renderCheckpoint);
					throw error;
				} finally {
					if (issued.preparation)
						await disposeAsyncPreservingPrimary(
							() => Promise.resolve(issued.preparation![Symbol.asyncDispose]()),
							renderPrimary
						);
				}
			}
			throw new Error(
				`eXact direct scheduled SSR component did not stabilize after ${maxPasses} render passes`
			);
		} catch (error) {
			context.onComponentAttemptRollback?.(constructionCheckpoint);
			throw error;
		} finally {
			await scheduled[Symbol.asyncDispose]();
		}
	}
	const direct = await renderDirectSsrComponent(context, blueprint, rawProps, parent, options);
	if (!direct) return undefined;
	const checkpoint = context.onComponentAttemptCheckpoint?.();
	let primary: unknown = noPrimaryFailure;
	try {
		context.onDirectComponentCreated?.(direct.snapshot);
		let directPrimary: unknown = noPrimaryFailure;
		let html: string;
		try {
			html = await renderDirectSsrContent(
				context,
				direct.content,
				direct.owner,
				renderChildren,
				renderOwnedComponent
			);
		} catch (error) {
			directPrimary = error;
			throw error;
		} finally {
			if (direct.preparation)
				await disposeAsyncPreservingPrimary(
					() => Promise.resolve(direct.preparation![Symbol.asyncDispose]()),
					directPrimary
				);
		}
		const output = publish(
			context,
			vnode,
			parent,
			html,
			direct.props,
			direct.snapshot,
			publication
		);
		context.onDirectComponentRendered?.(direct.snapshot);
		return output;
	} catch (error) {
		primary = error;
		context.onComponentAttemptRollback?.(checkpoint);
		throw error;
	} finally {
		if (direct.lifetime)
			await disposeAsyncPreservingPrimary(
				() => Promise.resolve(disposeDirectSsrLifetime(direct.lifetime!, 'ssr render complete')),
				primary
			);
	}
}

/**
 * Executes a compiler-classified synchronous component without constructing durable client
 * ownership. The request-local frame supports compiler-known state, contexts, lists, and scheduled
 * tasks; lifecycle, dynamic selection, and other durable surfaces remain separately classified.
 * Encountering a non-function result is therefore an artifact defect.
 */
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined
): DirectSsrComponentResult | undefined;
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): DirectSsrComponentResult | Promise<DirectSsrComponentResult> | undefined;
export function renderDirectSsrComponent(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	options?: SsrRenderOptions
): DirectSsrComponentResult | Promise<DirectSsrComponentResult> | undefined {
	const server = blueprint.contract.definition.server;
	if (server?.lane !== 'direct' || server.classification !== 'synchronous' || !server.render)
		return undefined;
	const createFrame: DirectSsrComponentFrameConstructor =
		(server.frame as DirectSsrComponentFrameConstructor | undefined) ??
		createDirectSsrComponentFrame;
	const frame = createFrame(
		context,
		blueprint.contract.definition.instantiate,
		blueprint.componentId,
		parent
	);
	const owner = server.frame ? directSsrContextOwner(frame) : parent;
	const props = directSsrProps(rawProps);
	const lifecycle = server.lifecycle as DirectSsrLifecycleCapability | undefined;
	let render: unknown;
	try {
		render = inComponentDomain(context, () => server.render!.call(frame, props));
		if (typeof render !== 'function')
			throw new TypeError(
				'Compiled synchronous server component did not return its render function'
			);
	} catch (error) {
		if (lifecycle) {
			try {
				disposeDirectSsrLifetimeSync({ frame, lifecycle }, 'ssr construction failed');
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
		}
		throw error;
	}
	const invokeRender = () => {
		const started = lifecycle ? performanceNow() : 0;
		const output = inComponentDomain(context, () => (render as () => unknown)());
		lifecycle?.rendered(frame, performanceNow() - started);
		return output;
	};
	let rendered: DirectIssuedRender | Promise<DirectIssuedRender>;
	try {
		rendered = options
			? renderIssuedServerComponentChildren(context, options, invokeRender, owner)
			: { content: readDirectSsrContent(invokeRender()) };
	} catch (error) {
		if (lifecycle) {
			try {
				disposeDirectSsrLifetimeSync({ frame, lifecycle }, 'ssr render failed');
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
		}
		throw error;
	}
	const project = ({ content, preparation }: DirectIssuedRender): DirectSsrComponentResult => ({
		content,
		...(lifecycle ? { lifetime: { frame, lifecycle } } : {}),
		owner,
		...(preparation ? { preparation } : {}),
		props,
		snapshot: {
			componentId: blueprint.componentId,
			contract: blueprint.contract,
			state: frame.state,
			props
		}
	});
	return rendered && typeof (rendered as Promise<DirectIssuedRender>).then === 'function'
		? Promise.resolve(rendered).then(project)
		: project(rendered as DirectIssuedRender);
}

function performanceNow(): number {
	return typeof globalThis.performance?.now === 'function'
		? globalThis.performance.now()
		: Date.now();
}
