import type { AnyComponentFunction } from '@exactjs/core';
import { reactCompatibilityArtifactTarget } from './adapter-identity.js';

const adapterCaches: Readonly<Record<'client' | 'server', WeakMap<object, AnyComponentFunction>>> =
	{
		client: new WeakMap(),
		server: new WeakMap()
	};

/** Selects the identity cache owned by the active client or server compatibility target. */
export function currentReactAdapterCache(): Readonly<{
	target: 'client' | 'server';
	cache: WeakMap<object, AnyComponentFunction>;
}> {
	const target = reactCompatibilityArtifactTarget();
	return { target, cache: adapterCaches[target] };
}
