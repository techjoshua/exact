import type { AnyComponentInstance } from '@exactjs/core';
import type { SsrContext } from '../types.js';
import type { ExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import { createDirectSsrContextFrame } from '../runtime/direct-context-frame.js';
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
	return createFrame(context, artifact.instantiate, artifact.id, parent);
}

/** Resolves logical ownership without projecting a temporary frame/owner pair. */
export function selectedDirectSsrOwner(
	contract: ExactServerExecutableComponentContract,
	frame: DirectSsrComponentFrame,
	parent: AnyComponentInstance | undefined
): AnyComponentInstance | undefined {
	return contract.artifact.capabilities.includes('contexts') || contract.artifact.execution.frame
		? directSsrContextOwner(frame)
		: parent;
}
