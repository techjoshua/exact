import { attachSuppressedCleanupFailure, type AnyComponentInstance } from '@exactjs/core';
import type { SsrContext } from '../types.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { prepareComponentProps } from './component-props.js';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';
import { readDirectSsrContent } from './direct-component-content.js';
import {
	inComponentDomain,
	type DirectSsrLifecycleCapability
} from './direct-component-support.js';
import { selectDirectSsrFrame } from './direct-frame-selection.js';
import type { DirectIssuedRender, DirectSsrComponentResult } from './direct-component-contracts.js';
import {
	disposeDirectSsrLifetimeSync,
	renderIssuedServerComponentChildren
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
	const server = blueprint.contract.artifact.execution;
	if (server?.lane !== 'direct' || server.classification !== 'synchronous' || !server.render)
		return undefined;
	if (options) {
		const prepared = prepareComponentProps(rawProps, server.deferredTaskProps, options.signal);
		if (prepared && typeof (prepared as Promise<Record<string, unknown>>).then === 'function')
			return Promise.resolve(prepared).then(async (props) => {
				const rendered = renderDirectSsrComponent(context, blueprint, props, parent, options);
				if (!rendered)
					throw new TypeError('Direct synchronous component lost its server artifact lane');
				return await rendered;
			});
		rawProps = prepared as Record<string, unknown>;
	}
	const { frame, owner } = selectDirectSsrFrame(context, blueprint, parent);
	const props = rawProps;
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
			host: frame,
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
