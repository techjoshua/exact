import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import { createDirectSsrContextFrame } from '../runtime/direct-context-frame.js';
import type { SsrContext } from '../types.js';
import {
	createDirectSsrComponentFrame,
	directSsrContextOwner,
	type DirectSsrComponentFrame,
	type DirectSsrComponentFrameConstructor
} from './direct-component-support.js';

/** Constructs the request-owned frame selected by immutable component capabilities. */
export function createSelectedDirectSsrFrame(
	context: SsrContext,
	contract: ExactServerExecutableComponentContract,
	parent: AnyComponentInstance | undefined
): DirectSsrComponentFrame {
	const artifact = contract.artifact;
	const server = artifact.execution;
	const contextBearing = artifact.capabilities.includes('contexts');
	const createFrame: DirectSsrComponentFrameConstructor = contextBearing
		? createDirectSsrContextFrame
		: ((server.frame as DirectSsrComponentFrameConstructor | undefined) ??
			createDirectSsrComponentFrame);
	const frame = createFrame(context, artifact.instantiate, artifact.id, parent);
	if (context.onDirectComponentCreated || context.onDirectComponentRendered) {
		// Observers need every logical parent, including stateless intermediates. Keep
		// the compiler-selected frame and lifecycle; add topology only on this path.
		Object.assign(frame, {
			parent,
			type: artifact.instantiate,
			id: artifact.id,
			domain: context.componentDomain,
			mounted: false,
			contexts: 'contexts' in frame ? frame.contexts : new Map<symbol, unknown>(),
			ambientContexts: context.componentContexts
		});
	}
	return frame;
}

/** Resolves logical ownership without projecting a temporary frame/owner pair. */
export function selectedDirectSsrOwner(
	context: SsrContext,
	contract: ExactServerExecutableComponentContract,
	frame: DirectSsrComponentFrame,
	parent: AnyComponentInstance | undefined
): AnyComponentInstance | undefined {
	return context.onDirectComponentCreated ||
		context.onDirectComponentRendered ||
		contract.artifact.capabilities.includes('contexts') ||
		contract.artifact.execution.frame
		? directSsrContextOwner(frame)
		: parent;
}
