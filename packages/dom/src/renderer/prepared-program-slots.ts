import {
	readRenderProgramSlot,
	type ExactRenderProgramInvocation
} from '@exactjs/core/runtime/render-operations';

/** Slots evaluated while choosing incoming enhancement targets for one attachment. */
export type PreparedProgramSlots = Map<ExactRenderProgramInvocation, Map<number, unknown>>;
const prepared = new WeakMap<ExactRenderProgramInvocation, ReadonlyMap<number, unknown>>();

/** Keeps target selection and adoption on the same opaque values, releasing them after attachment. */
export function withPreparedProgramSlots<T>(values: PreparedProgramSlots, attach: () => T): T {
	const previous = new Map<
		ExactRenderProgramInvocation,
		ReadonlyMap<number, unknown> | undefined
	>();
	for (const [invocation, slots] of values) {
		previous.set(invocation, prepared.get(invocation));
		prepared.set(invocation, slots);
	}
	try {
		return attach();
	} finally {
		for (const [invocation, slots] of previous) {
			if (slots) prepared.set(invocation, slots);
			else prepared.delete(invocation);
		}
	}
}

/** Supplies captured target slots only during initial adoption, retaining normal readers for updates. */
export function preparedProgramInvocation(
	invocation: ExactRenderProgramInvocation
): ExactRenderProgramInvocation {
	const slots = prepared.get(invocation);
	if (!slots) return invocation;
	return {
		...invocation,
		eagerValues: undefined,
		readers: (index) =>
			slots.has(index) ? slots.get(index) : readRenderProgramSlot(invocation, index)
	};
}
