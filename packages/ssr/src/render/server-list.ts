import type { Child } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';

const preparedServerList = Symbol.for('@exactjs/ssr/prepared-list');

/** Request-local keyed-list output; its existing fragment boundary owns ordered child traversal. */
export type ServerList = Readonly<{
	[preparedServerList]: true;
	children: readonly Child[];
	key: string | undefined;
}>;

/** Retains already-issued list children without a generic fragment receipt or private registration. */
export function createServerList(children: readonly Child[], authoredKey?: unknown): ServerList {
	const key = unwrap(authoredKey);
	return {
		[preparedServerList]: true,
		children,
		key: key === null || key === undefined ? undefined : String(key)
	};
}

/** Recognizes the direct list carrier shared by server-runtime copies in the same realm. */
export function readServerList(value: unknown): ServerList | undefined {
	return typeof value === 'object' && value !== null && preparedServerList in value
		? (value as ServerList)
		: undefined;
}
