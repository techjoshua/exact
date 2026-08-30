import type { AnyComponentInstance } from '@exactjs/core';
import type { SsrContext } from '../types.js';
import { createDirectSsrContextFrame } from '../runtime/direct-context-frame.js';
import type { SsrComponentExecutionBlueprint } from './root-execution-cache.js';
import {
	createDirectSsrComponentFrame,
	directSsrContextOwner,
	type DirectSsrComponentFrame,
	type DirectSsrComponentFrameConstructor
} from './direct-component-support.js';

/** Request-local frame and logical owner selected from compiler-emitted component capabilities. */
export type SelectedDirectSsrFrame = Readonly<{
	frame: DirectSsrComponentFrame;
	owner: AnyComponentInstance | undefined;
}>;

/** Selects renderer-owned frame construction without embedding renderer imports in an artifact. */
export function selectDirectSsrFrame(
	context: SsrContext,
	blueprint: SsrComponentExecutionBlueprint,
	parent: AnyComponentInstance | undefined
): SelectedDirectSsrFrame {
	const artifact = blueprint.contract.artifact;
	const server = artifact.execution;
	const contextBearing = artifact.capabilities.includes('contexts');
	const createFrame: DirectSsrComponentFrameConstructor = contextBearing
		? createDirectSsrContextFrame
		: ((server.frame as DirectSsrComponentFrameConstructor | undefined) ??
			createDirectSsrComponentFrame);
	const frame = createFrame(context, artifact.instantiate, blueprint.componentId, parent);
	return {
		frame,
		owner: contextBearing || server.frame ? directSsrContextOwner(frame) : parent
	};
}
