import { unwrap, type AnyComponentInstance } from '@exactjs/core';
import {
	readExactClientExecutableComponentContract,
	type ExactComponentContinuationContract
} from '@exactjs/core/framework/component-contracts';
import type {
	ArrayClientBinding,
	ArrayCorrespondence
} from '@exactjs/reactive/framework/array-patch';
import type { ArrayResponseContext } from '../response/json.js';
import type { PreparedExactState } from '../invocations.js';
import { stateForContract } from '../state.js';
import { captureStateMembers, type CapturedStateMembers } from '../state-publication.js';

/** One submitted snapshot and its live correspondence, owned until apply or discard. */
export type ContinuationSubmission = {
	state: unknown;
	members: CapturedStateMembers;
	array?: { binding: ArrayClientBinding; correspondence: ArrayCorrespondence };
	arrayParser?: ArrayResponseContext;
	preparedState?: PreparedExactState;
	release(): void;
};

/** Selects one finite submission after the optimistic prelude, preserving every actual property sample. */
export function captureContinuationSubmission(
	state: unknown,
	continuation: ExactComponentContinuationContract,
	instance?: AnyComponentInstance,
	registered?: ArrayClientBinding
): ContinuationSubmission {
	const samples = new WeakMap<object, Map<string, unknown>>();
	const sample = (receiver: object, key: string) => {
		const raw = unwrap(receiver);
		let row = samples.get(raw);
		if (!row) {
			row = new Map();
			samples.set(raw, row);
		}
		if (!row.has(key)) row.set(key, Reflect.get(receiver, key));
		return row.get(key);
	};
	const selectedState = stateForContract(state, { reads: continuation.stateReads }, sample);
	const needsArray = continuation.stateWrites.some((write) => write.arrayRoots?.length);
	const binding =
		needsArray && instance
			? readExactClientExecutableComponentContract(instance.type).artifact.array
			: needsArray
				? registered
				: undefined;
	if (needsArray && !binding) throw new TypeError('Missing admitted Array client binding');
	const roots = new Map<string, { path: readonly string[] }>();
	for (const write of continuation.stateWrites)
		for (const root of write.arrayRoots ?? []) {
			const key = root.path.join('.');
			if (roots.has(key)) continue;
			roots.set(key, { path: root.path });
		}
	const capture = binding?.capture(selectedState, [...roots.values()]);
	const members =
		state && typeof state === 'object'
			? captureStateMembers(state, continuation.stateWrites, sample, capture?.correspondence)
			: new Map();
	const submission: ContinuationSubmission = {
		state: selectedState,
		members,
		...(binding && capture
			? {
					array: { binding, correspondence: capture.correspondence },
					arrayParser: { version: 4 as const, parse: binding.parse }
				}
			: {}),
		...(capture && selectedState !== undefined
			? { preparedState: { encoded: capture.encodedState, valueDepth: capture.valueDepth } }
			: {}),
		release() {
			capture?.release();
			if (members instanceof Map) members.clear();
			roots.clear();
			submission.state = undefined;
			submission.array = undefined;
			submission.preparedState = undefined;
		}
	};
	return submission;
}
