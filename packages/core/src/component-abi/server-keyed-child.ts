import { unwrap } from '@exactjs/reactive/framework/values';

const PreparedServerKeyedChild = Symbol.for('@exactjs/server/prepared-keyed-child');

/** Direct request-local keyed child emitted only by compiler-closed server artifacts. */
export type ExactPreparedServerKeyedChild = Readonly<{
	readonly value: unknown;
	readonly key: string;
}>;

/** Joins server-local list identity without allocating an opaque operation or private payload. */
export function createPreparedServerKeyedChild(
	value: unknown,
	authoredKey: unknown
): ExactPreparedServerKeyedChild {
	const key = unwrap(authoredKey);
	if (key === null || key === undefined) throw new Error('Compiled keyed lists require a key');
	const child = { [PreparedServerKeyedChild]: true, value, key: String(key) };
	return child;
}

/** Reads only direct keyed children issued by compiler-closed server artifacts. */
export function readPreparedServerKeyedChild(
	value: unknown
): ExactPreparedServerKeyedChild | undefined {
	return typeof value === 'object' && value !== null && PreparedServerKeyedChild in value
		? (value as unknown as ExactPreparedServerKeyedChild)
		: undefined;
}
