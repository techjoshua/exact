import {
	createDirectSsrComponentFrame,
	type DirectSsrLoggingFrame
} from '../render/direct-component-support.js';
import type { AnyComponentFunction, AnyComponentInstance } from '@exactjs/core';
import type { SsrContext } from '../types.js';

/** Constructs the focused request-local frame selected for a direct component that logs. */
export function createDirectSsrLoggingFrame(
	context: SsrContext,
	type: AnyComponentFunction,
	componentId: string,
	parent: AnyComponentInstance | undefined
): DirectSsrLoggingFrame {
	return Object.assign(createDirectSsrComponentFrame(), {
		type,
		id: componentId,
		mounted: false as const,
		parent,
		domain: context.componentDomain!,
		ambientContexts: context.componentContexts
	}) satisfies DirectSsrLoggingFrame;
}
