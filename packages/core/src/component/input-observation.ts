import {
	isReactiveValue,
	peek,
	readIndexedReactiveSlot,
	readIndexedReactiveSource,
	watch,
	withEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import type { ExactCompiledComponentInputUpdateContract } from '../component-definition-contracts.js';

/**
 * Observes a retained parent expression for a compact input plan. Finalized primitive inputs keep
 * the allocation-free receive path. The component scope owns observation through replacements and
 * disposal; the first read arms dependencies without replaying setup over resumed state.
 */
export function observeRetainedComponentInput(
	instance: Readonly<{ state: object; props: object }>,
	plan: ExactCompiledComponentInputUpdateContract,
	binding: readonly [slot: number, dirtyLow: number, dirtyHigh: number],
	scope: EffectScope
): boolean {
	const source = readIndexedReactiveSource(instance.props, binding[0]);
	if (!source.present || !isReactiveValue(source.value)) return false;
	let initialized = false;
	let previous: unknown;
	withEffectScope(scope, () =>
		watch(() => {
			const value = readIndexedReactiveSlot(instance.props, binding[0]);
			const changed = initialized && !Object.is(previous, value);
			previous = value;
			initialized = true;
			if (changed) peek(() => plan.apply(instance, binding[1], binding[2]));
		})
	);
	return true;
}
