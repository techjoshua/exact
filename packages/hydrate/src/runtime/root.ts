import {
	type AnyComponentFunction,
	withComponentDomain,
	type Child,
	type ComponentDomain
} from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-abi';
import type { ExactClient } from '../types.js';
import { bindRequestClientDomain } from './client.js';

/**
 * Creates an opaque component operation beneath a hidden immutable request root while
 * retaining the supplied ownership domain on every native operation it authors.
 * @internal
 */
export function createExactRoot(
	client: ExactClient,
	component: AnyComponentFunction,
	componentProps?: Record<string, unknown>,
	children?: Child | Child[],
	domain: ComponentDomain = client.domain
): Child {
	bindRequestClientDomain(domain, client);
	return withComponentDomain(domain, () =>
		createCompiledComponentReceipt(component, {
			...(componentProps ?? {}),
			...(children === undefined ? {} : { children })
		})
	);
}
