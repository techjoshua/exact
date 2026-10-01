import { selectNativeOperation } from '../internal/native-operations.js';
import { unwrap } from '../internal/values.js';
import type { PendingReactiveState } from './pending-state-contract.js';

/** Selects native Date readers by identity and rejects unjournaled timestamp mutation.
 * Brand-checked readers receive original storage. Polymorphic conversion methods retain
 * the pending facade so authored overrides still execute against pending state.
 */
export function selectPendingDateMethod(
	context: PendingReactiveState & { owns(value: object): boolean },
	original: unknown,
	receiver: unknown
): ((...args: unknown[]) => unknown) | undefined {
	if (typeof original !== 'function' || !receiver || typeof receiver !== 'object') return undefined;
	const native = selectNativeOperation(original, unwrap(receiver));
	const raw = unwrap(receiver);
	if (native?.kind !== 'date') return undefined;
	const { key } = native;
	return (...args) => {
		if (typeof key === 'string' && key.startsWith('set') && context.owns(receiver))
			throw new TypeError('Pending Date mutation requires replacing the Date value');
		const owner = key === 'toJSON' || key === Symbol.toPrimitive ? context.view(receiver) : raw;
		return Reflect.apply(
			original,
			owner,
			args.map((value) => context.view(value))
		);
	};
}
