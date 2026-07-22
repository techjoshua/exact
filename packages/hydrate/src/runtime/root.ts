import {
	createVNode,
	withComponentDomain,
	type Child,
	type ComponentDomain,
	type ComponentFunction,
	type VNode
} from '@exact/core';
import type { ExactClient } from '../types.js';
import { bindRequestClientDomain } from './client.js';

/** @internal Creates an ordinary component beneath a hidden immutable request-root provider. */
export function createExactRoot(
	client: ExactClient,
	component: ComponentFunction<any, any>,
	componentProps?: Record<string, unknown>,
	children?: Child | Child[],
	domain: ComponentDomain = client.domain
): VNode {
	bindRequestClientDomain(domain, client);
	return withComponentDomain(domain, () =>
		createVNode(component, {
			...(componentProps ?? {}),
			...(children === undefined ? {} : { children })
		})
	);
}
