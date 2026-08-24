import type { AnyComponentFunction } from '@exactjs/core';
import { createExactCompatibilityArtifact } from '@exactjs/core/framework/component-contracts';
import {
	componentDomainTarget,
	currentComponentDomain
} from '@exactjs/core/framework/component-domains';
import '@exactjs/core/runtime/collections';
import '@exactjs/core/runtime/lifecycle';
import '@exactjs/core/runtime/tasks';

let nextCompatibilityAdapterId = 0;

/** Returns the target of the component domain currently converting React-owned values. */
export function reactCompatibilityArtifactTarget(): 'client' | 'server' {
	const domain = currentComponentDomain();
	return domain ? componentDomainTarget(domain) : 'client';
}

/** Brands one generated React adapter with a unique target-local framework identity. */
export function markCompatibilityAdapter<T extends AnyComponentFunction>(
	adapter: T,
	target = reactCompatibilityArtifactTarget()
): T {
	return createExactCompatibilityArtifact(
		adapter,
		`@exactjs/react-compat:adapter:${++nextCompatibilityAdapterId}`,
		target
	);
}

/** Creates the client and server artifacts for one static React compatibility boundary. */
export function createCompatibilityArtifactVariants<T extends AnyComponentFunction>(
	implementation: T,
	identity: string
): Readonly<Record<'client' | 'server', T>> {
	const create = (target: 'client' | 'server'): T => {
		const targetImplementation = function (this: unknown, ...args: unknown[]) {
			return Reflect.apply(implementation, this, args);
		} as T;
		return createExactCompatibilityArtifact(targetImplementation, identity, target);
	};
	return Object.freeze({ client: create('client'), server: create('server') });
}
