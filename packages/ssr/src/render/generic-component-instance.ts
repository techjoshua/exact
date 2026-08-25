import { createComponentInstance } from '@exactjs/core/runtime/render';
import type {
	AnyComponentInstance,
	ComponentFunction,
	ComponentInstance,
	SsrContext
} from '../types.js';

/** Constructs a durable component only for the explicitly selected generic SSR lane. */
export function createGenericSsrComponentInstance<
	State extends object,
	Props extends Record<string, unknown>
>(
	context: SsrContext,
	component: ComponentFunction<State, Props>,
	props: Props,
	parent: AnyComponentInstance | undefined
): ComponentInstance<State> {
	return createComponentInstance(
		component,
		props,
		parent,
		context.componentContexts,
		context.componentDomain
	);
}
