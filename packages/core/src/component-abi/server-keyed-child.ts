import { unwrap } from '@exactjs/reactive/framework/values';
import type { ExactPreparedServerRenderProgram } from '../render-program.js';

const PreparedServerKeyedChild = Symbol.for('@exactjs/server/prepared-keyed-child');

/** Direct request-local keyed child emitted only by compiler-closed server artifacts. */
export type ExactPreparedServerKeyedChild = Readonly<{
	readonly value: unknown;
	readonly key: string;
}>;

/** Validates a list key while reusing the compiler-proven program's existing item boundary. */
export function createPreparedServerKeyedChild(
	value: ExactPreparedServerRenderProgram,
	authoredKey: unknown,
	program: true
): ExactPreparedServerRenderProgram;
/** Retains server-local list identity for values requiring a separate keyed boundary. */
export function createPreparedServerKeyedChild(
	value: unknown,
	authoredKey: unknown
): ExactPreparedServerKeyedChild;
/** Only compiler-proven program children may omit the wrapper; key validation and coercion remain. */
export function createPreparedServerKeyedChild(
	value: unknown,
	authoredKey: unknown,
	program = false
): ExactPreparedServerKeyedChild | ExactPreparedServerRenderProgram {
	const key = unwrap(authoredKey);
	if (key === null || key === undefined) throw new Error('Compiled keyed lists require a key');
	const normalizedKey = String(key);
	if (program) return value as ExactPreparedServerRenderProgram;
	const child = { [PreparedServerKeyedChild]: true, value, key: normalizedKey };
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
