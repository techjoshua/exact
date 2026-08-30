import type { AnyComponentInstance, Child } from '@exactjs/core';
import {
	readRenderProgramReceipt,
	reparentComponentInstance
} from '@exactjs/core/runtime/render-operations';
import {
	readCompiledComponentReceipt,
	readCompiledFragmentReceipt,
	readCompiledIntrinsicReceipt
} from '@exactjs/core/runtime/component-operations';
import { transferEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../../types.js';
import { receiveComponentReceipt } from './native-component-artifact.js';

/** Reclaims an authored compiler operation parked by one enhancement replacement transaction. */
export function takeParkedOperation(
	root: Root,
	value: Child,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined
): Mounted | undefined {
	const mounts = root.replacementParking?.mounts;
	let parkedKey: Child | undefined = value;
	let candidates = mounts?.get(value);
	if (!candidates?.length) {
		const receipt = readCompiledComponentReceipt(value);
		if (receipt && mounts) {
			for (const [candidateKey, candidateMounts] of mounts) {
				const candidate =
					readCompiledComponentReceipt(candidateKey) ??
					candidateMounts[0]?.mounted.componentReceipt;
				if (
					candidate &&
					candidate.contract.artifact === receipt.contract.artifact &&
					candidate.key === receipt.key &&
					candidate.domain === receipt.domain
				) {
					parkedKey = candidateKey;
					candidates = candidateMounts;
					break;
				}
			}
		}
	}
	const parked = candidates?.shift();
	if (!parked) return undefined;
	if (!candidates?.length && parkedKey) mounts?.delete(parkedKey);
	root.replacementParking?.commits.push(() => {
		transferEffectScope(parked.mounted.scope, parentScope);
		parked.mounted.operation = value;
		const component = readCompiledComponentReceipt(value);
		if (component) {
			if (parked.mounted.instance) {
				reparentComponentInstance(parked.mounted.instance, parentInstance);
				receiveComponentReceipt(parked.mounted, component);
			} else parked.mounted.componentReceipt = component;
		}
		const intrinsic = readCompiledIntrinsicReceipt(value);
		if (intrinsic) parked.mounted.intrinsicReceipt = intrinsic;
		const fragment = readCompiledFragmentReceipt(value);
		if (fragment) parked.mounted.fragmentReceipt = fragment;
		const program = readRenderProgramReceipt(value);
		if (program) parked.mounted.renderProgramReceipt = program;
	});
	return parked.mounted;
}
