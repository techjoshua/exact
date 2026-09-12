import { type AnyComponentInstance } from '@exactjs/core';
import type { ExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import type { DirectSsrComponentSnapshot, SsrContext } from '../types.js';
import { prepareComponentProps } from './component-props.js';
import type { DirectSsrComponentContent } from './direct-component-content.js';
import type { DirectIssuedRender } from './direct-component-contracts.js';
import { renderIssuedServerComponentChildren } from './direct-component-scheduling.js';
import {
	inComponentDomain,
	statelessDirectSsrComponentFrame,
	type DirectSsrLifecycleCapability
} from './direct-component-support.js';
import { createSelectedDirectSsrFrame, selectedDirectSsrOwner } from './direct-frame-selection.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { mapRenderValue, withRenderCleanup, type RenderValue } from './execution.js';

export type { DirectSsrComponentContent } from './direct-component-content.js';
export type {
	DirectIssuedRender,
	DirectScheduledPreparation,
	DirectScheduledSsrComponent,
	DirectSsrComponentPublisher,
	PreparedDirectScheduledSsrComponent
} from './direct-component-contracts.js';
export {
	createDirectScheduledSsrComponent,
	disposeDirectSsrLifetime,
	renderIssuedServerComponentChildren,
	takePreparedDirectScheduledSsrComponent
} from './direct-component-scheduling.js';

/** Shared output sink selected after direct child preparation. */
export type DirectSsrSink<Result> = (
	content: DirectSsrComponentContent,
	owner: AnyComponentInstance | undefined,
	props: Record<string, unknown>,
	snapshot: DirectSsrComponentSnapshot
) => Result | Promise<Result>;

/** Executes available component work directly, suspending only preparation, descendants, or cleanup. */
export function executeDirectSsrComponent<Result>(
	context: SsrContext,
	contract: ExactServerExecutableComponentContract,
	rawProps: Record<string, unknown>,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	sink: DirectSsrSink<Result>,
	// Only the reference owner may supply a consumed, identity-checked compiler proof.
	scalarPropsProven = false
): RenderValue<Result | undefined> {
	const artifact = contract.artifact;
	const server = artifact.execution;
	if (server?.lane !== 'direct' || server.classification !== 'synchronous' || !server.render)
		return undefined;
	return mapRenderValue(
		scalarPropsProven
			? rawProps
			: prepareComponentProps(rawProps, server.deferredTaskProps, options),
		(props) => {
			const stateless =
				server.mode === 'stateless' &&
				!context.onDirectComponentCreated &&
				!context.onDirectComponentRendered;
			// Stateless artifacts need no attempt or publication lifetime unless observers
			// request it. Issued descendant tasks retain their own cleanup boundary.
			if (
				stateless &&
				!server.lifecycle &&
				!context.onComponentAttemptCheckpoint &&
				!context.onComponentAttemptRollback
			) {
				const frame = statelessDirectSsrComponentFrame;
				const issued = renderIssuedServerComponentChildren(
					context,
					options,
					() => inComponentDomain(context, () => server.render!.call(frame, props)),
					parent
				);
				return mapRenderValue(issued, (content) => {
					const snapshot = {
						componentId: artifact.id,
						contract,
						host: frame,
						state: frame.state,
						props
					};
					const preparation = content.preparation;
					if (!preparation) return sink(content.content, parent, props, snapshot);
					return withRenderCleanup(
						() => sink(content.content, parent, props, snapshot),
						() => Promise.resolve(preparation[Symbol.asyncDispose]())
					);
				});
			}
			const frame = stateless
				? statelessDirectSsrComponentFrame
				: createSelectedDirectSsrFrame(context, contract, parent);
			const owner = stateless ? parent : selectedDirectSsrOwner(contract, frame, parent);
			const lifecycle = server.lifecycle as DirectSsrLifecycleCapability | undefined;
			let preparation: DirectIssuedRender['preparation'];
			let checkpoint: unknown;
			let resumptionCheckpoint: number | undefined;
			let attempted = false;
			let published = false;
			return withRenderCleanup(
				() => {
					let render: unknown;
					if (server.mode !== 'direct' && server.mode !== 'stateless') {
						render = inComponentDomain(context, () => server.render!.call(frame, props));
						if (typeof render !== 'function')
							throw new TypeError(
								'Compiled synchronous server component did not return its render function'
							);
					}
					const started = lifecycle ? performanceNow() : 0;
					const issued = renderIssuedServerComponentChildren(
						context,
						options,
						() =>
							inComponentDomain(context, () =>
								server.mode === 'direct' || server.mode === 'stateless'
									? server.render!.call(frame, props)
									: (render as () => unknown)()
							),
						owner
					);
					return mapRenderValue(issued, (content) => {
						lifecycle?.rendered(frame, performanceNow() - started);
						preparation = content.preparation;
						const snapshot = {
							componentId: artifact.id,
							contract,
							host: frame,
							state: frame.state,
							props
						};
						checkpoint = context.onComponentAttemptCheckpoint?.();
						resumptionCheckpoint = stateless ? undefined : options.resumptionCapture?.checkpoint();
						attempted = true;
						const token = stateless
							? undefined
							: options.resumptionCapture?.reserveDirect(artifact.id, contract);
						context.onDirectComponentCreated?.(snapshot);
						return mapRenderValue(sink(content.content, owner, props, snapshot), (output) => {
							if (token !== undefined)
								options.resumptionCapture?.publishDirect(token, frame, frame.state, props);
							context.onDirectComponentRendered?.(snapshot);
							published = true;
							return output;
						});
					});
				},
				() => {
					if (attempted && !published) {
						return withRenderCleanup(
							() => {
								if (resumptionCheckpoint !== undefined)
									options.resumptionCapture?.rollback(resumptionCheckpoint);
								context.onComponentAttemptRollback?.(checkpoint);
							},
							() =>
								withRenderCleanup(
									() =>
										preparation ? Promise.resolve(preparation[Symbol.asyncDispose]()) : undefined,
									() => lifecycle?.dispose(frame, 'ssr render complete')
								)
						);
					}
					return withRenderCleanup(
						() => (preparation ? Promise.resolve(preparation[Symbol.asyncDispose]()) : undefined),
						() => lifecycle?.dispose(frame, 'ssr render complete')
					);
				}
			);
		}
	);
}

function performanceNow(): number {
	return typeof globalThis.performance?.now === 'function'
		? globalThis.performance.now()
		: Date.now();
}
