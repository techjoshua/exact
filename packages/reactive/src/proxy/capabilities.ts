import type { ReactiveOptions } from '../internal/types.js';

/** Collection-member implementation injected only by the general reactive entry. */
export type ReactiveCollectionMember = (
	target: Map<unknown, unknown> | Set<unknown>,
	key: PropertyKey,
	receiver: object,
	options: ReactiveOptions,
	wrap: (value: unknown, dependency?: PropertyKey) => unknown,
	invoke?: () => unknown,
	selected?: unknown
) => unknown;

/** Existing proxy capabilities and trap-local forwarding state, retained for internal publication. */
export type ReactiveProxyRecord = {
	readonly options: ReactiveOptions;
	readonly collectionMember?: ReactiveCollectionMember;
	forwardingSet: boolean;
	proxy?: object;
};
