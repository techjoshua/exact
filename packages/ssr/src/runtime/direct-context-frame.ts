import type { ContextToken } from '@exactjs/core';
import {
	getComponentContext,
	hasComponentContext,
	setComponentContext
} from '@exactjs/core/framework/server-component-contexts';
import {
	createDirectSsrComponentFrame,
	type DirectSsrComponentFrameConstructor,
	type DirectSsrContextFrame
} from '../render/direct-component-support.js';

/** Constructs the request-local frame emitted only for a context-bearing direct component. */
export const createDirectSsrContextFrame: DirectSsrComponentFrameConstructor = (
	context,
	type,
	componentId,
	parent
) => {
	const frame = createDirectSsrComponentFrame();
	const contexts = new Map<symbol, unknown>();
	const contextTokens = new Map<symbol, ContextToken<unknown>>();
	const owner: DirectSsrContextFrame = Object.assign(frame, {
		type,
		id: componentId,
		mounted: false as const,
		parent,
		domain: context.componentDomain!,
		ambientContexts: context.componentContexts,
		contexts,
		contextTokens,
		hasContext(token: ContextToken<unknown>) {
			contextTokens.set(token.id, token);
			return hasComponentContext(owner, owner.ambientContexts, token);
		},
		getContext<T>(token: ContextToken<T>) {
			contextTokens.set(token.id, token);
			return getComponentContext(owner, owner.ambientContexts, token);
		},
		setContext<T>(token: ContextToken<T>, value: T) {
			contextTokens.set(token.id, token);
			setComponentContext(owner, token, value);
		}
	}) satisfies DirectSsrContextFrame;
	return owner;
};
