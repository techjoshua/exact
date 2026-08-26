import {
	createDirectSsrComponentFrame,
	type DirectSsrComponentFrameConstructor,
	type DirectSsrLoggingFrame
} from '../render/direct-component-support.js';

/** Constructs the focused request-local frame selected for a direct component that logs. */
export const createDirectSsrLoggingFrame: DirectSsrComponentFrameConstructor = (
	context,
	type,
	componentId,
	parent
) =>
	Object.assign(createDirectSsrComponentFrame(), {
		type,
		id: componentId,
		mounted: false as const,
		parent,
		domain: context.componentDomain!,
		ambientContexts: context.componentContexts
	}) satisfies DirectSsrLoggingFrame;
