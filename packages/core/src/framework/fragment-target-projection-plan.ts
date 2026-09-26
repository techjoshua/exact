import type { AnyComponentInstance, Child } from '../component/contracts.js';
import { unwrap } from '@exactjs/reactive/framework/values';
import {
	readCompiledTargetReceipt,
	createCompiledTargetReceipt
} from '../component-abi/target-receipt.js';
import {
	readCompiledIntrinsicReceipt,
	withIntrinsicReceiptChildren
} from '../component-abi/intrinsic-receipt.js';
import {
	readCompiledFragmentReceipt,
	createCompiledFragmentReceipt,
	createCompiledFragmentPresentation
} from '../component-abi/fragment-receipt.js';
import { readChildRangeReceipt } from '../component-abi/child-range-receipt.js';
import {
	readPreparedServerChildRange,
	createPreparedServerChildRange
} from '../component-abi/server-child-range.js';
import { readPreparedServerRenderProgram } from '../server-render-program.js';
import {
	readRenderProgramReceipt,
	createPreparedRenderProgram,
	readRenderProgramSlot
} from '../render-program.js';
import { readPreparedTargetOutput } from './prepared-target-output.js';
import { FragmentPresentationHosts } from './fragment-hosts.js';

/**
 * Projects only one enhancement owner's supplied placement, preserving its authored structure.
 * Nested component implementations stay opaque. Each owner is a host-coalescing barrier; transparent
 * consecutive owners are grouped before this path. The caller supplies range evaluation: clients
 * retain invalidation, while servers resolve the current render attempt without subscriptions.
 */
export function createFragmentTargetProjectionWithRanges(
	supplied: Child | (() => Child),
	tag: string,
	owner: AnyComponentInstance | undefined,
	projectRange: (read: () => Child, markerId?: string, mayReplaceSubtree?: boolean) => Child
): (children: readonly Child[]) => Child[] {
	const identity = Symbol('fragment contribution');
	const hosts = new FragmentPresentationHosts();
	const cache = new WeakMap<object, Child>();
	const map = (raw: unknown): unknown => {
		const selected = typeof supplied === 'function' ? supplied() : supplied;
		if (raw === selected) return raw;
		const value = unwrap(raw);
		if (value === selected) return value;
		if (Array.isArray(value)) return value.map(map);
		if (typeof value !== 'object' || value === null) return value;
		const retained = cache.get(value);
		if (retained !== undefined) return retained;
		const target = readCompiledTargetReceipt(value);
		let result: unknown = value;
		if (target) {
			const contribution = readPreparedTargetOutput([value as Child], selected)!;
			const presentation = createCompiledFragmentPresentation(
				selected,
				hosts
					.reconcile([
						{
							owner: identity,
							tag,
							props: contribution.props,
							declaredHostProps: contribution.declaredHostProps
						}
					])
					.map((host) => ({
						identity: host.identity,
						tag: host.tag,
						contributions: [{ identity, props: contribution.props, owner }]
					}))
			);
			result = createCompiledTargetReceipt(null, presentation);
		} else {
			const intrinsic = readCompiledIntrinsicReceipt(value);
			const fragment = readCompiledFragmentReceipt(value);
			const range = readChildRangeReceipt(value);
			const serverRange = readPreparedServerChildRange(value);
			const program = readRenderProgramReceipt(value);
			const serverProgram = readPreparedServerRenderProgram(value);
			if (intrinsic)
				result = withIntrinsicReceiptChildren(
					value,
					intrinsic.children.map((child) => map(child) as Child)
				);
			else if (fragment)
				result = createCompiledFragmentReceipt(
					{ ...fragment.props, key: fragment.key, __exactEnhancements: fragment.enhancement },
					...fragment.children.map(map)
				);
			else if (range && !range.dynamicComponent)
				result = projectRange(
					() => map(range.value) as Child,
					range.markerId,
					range.mayReplaceSubtree
				);
			else if (serverRange)
				result = createPreparedServerChildRange(
					map(serverRange.value) as Child,
					serverRange.markerId,
					serverRange.mayReplaceSubtree
				);
			else if (program) {
				const invocation = program.invocation;
				const slots = new Set(invocation.program.targetSlots ?? []);
				result = createPreparedRenderProgram(
					invocation.program,
					(index) =>
						slots.has(index)
							? map(readRenderProgramSlot(invocation, index))
							: readRenderProgramSlot(invocation, index),
					invocation.owner,
					invocation.propertyWriter,
					program.enhancement
				);
			} else if (serverProgram) {
				const slots = new Set(serverProgram.program.targetSlots ?? []);
				const values = (input: readonly unknown[]) =>
					input.map((entry, index) => (slots.has(index) ? map(entry) : entry));
				result = {
					...serverProgram,
					eagerValues: values(serverProgram.eagerValues),
					...(serverProgram.deferredValues
						? {
								deferredValues: {
									...serverProgram.deferredValues,
									read: () => values(serverProgram.deferredValues!.read())
								}
							}
						: {})
				};
			}
		}
		cache.set(value, result as Child);
		return result;
	};
	return (children) => children.map((child) => map(child) as Child);
}
