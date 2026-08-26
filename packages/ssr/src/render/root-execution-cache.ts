import { type AnyComponentFunction, type VNode } from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentIdentity,
	readLinkedExactCompiledComponentContract,
	readPreparedExactCompiledComponentContract,
	type ExactCompiledComponentContract
} from '@exactjs/core/framework/component-contracts';
import type { SsrContext } from '../types.js';

/** Validated component metadata cached beneath one SSR root component. */
export type SsrComponentExecutionBlueprint = Readonly<{
	componentId: string;
	contract: ExactCompiledComponentContract;
}>;

/** Root-scoped cache whose weak expansion entries accommodate dynamic component selection. */
export type SsrRootExecutionBlueprint = {
	resolve(component: AnyComponentFunction): SsrComponentExecutionBlueprint;
};

const rootBlueprints = new WeakMap<AnyComponentFunction, SsrRootExecutionBlueprint>();
const linkedBlueprints = new WeakMap<
	ExactCompiledComponentContract,
	SsrComponentExecutionBlueprint
>();

/** Attaches the reusable blueprint for a component root after output extensions select it. */
export function attachSsrRootExecutionBlueprint(context: SsrContext, vnode: VNode): void {
	if (typeof vnode.type !== 'function') return;
	context.rootExecutionBlueprint = ssrRootExecutionBlueprint(vnode.type);
}

/** Resolves one component invocation, consuming its compiler-linked artifact when present. */
export function resolveSsrVNodeExecution(
	context: SsrContext,
	vnode: VNode
): SsrComponentExecutionBlueprint {
	const component = vnode.type as AnyComponentFunction;
	const linked = readLinkedExactCompiledComponentContract(vnode);
	return linked
		? linkedComponentBlueprint(component, linked)
		: resolveSsrComponentExecution(context, component);
}

/** Resolves cached validated metadata for one component reached beneath the active root. */
export function resolveSsrComponentExecution(
	context: SsrContext,
	component: AnyComponentFunction
): SsrComponentExecutionBlueprint {
	return context.rootExecutionBlueprint?.resolve(component) ?? prepareComponentBlueprint(component);
}

/** Returns the stable cache object owned by one root component function. */
export function ssrRootExecutionBlueprint(root: AnyComponentFunction): SsrRootExecutionBlueprint {
	let blueprint = rootBlueprints.get(root);
	if (!blueprint) {
		const components = new WeakMap<AnyComponentFunction, CachedBlueprint>();
		blueprint = {
			resolve(component) {
				const rawContract = attachedValue(component, exactComponentContract);
				const componentId = exactComponentIdentity(component);
				const cached = components.get(component);
				if (cached && cached.rawContract === rawContract && cached.componentId === componentId)
					return cached.blueprint;
				const prepared = prepareComponentBlueprint(component);
				components.set(component, { rawContract, componentId, blueprint: prepared });
				return prepared;
			}
		};
		rootBlueprints.set(root, blueprint);
	}
	return blueprint;
}

type CachedBlueprint = Readonly<{
	rawContract: unknown;
	componentId: string;
	blueprint: SsrComponentExecutionBlueprint;
}>;

function prepareComponentBlueprint(
	component: AnyComponentFunction,
	contract: ExactCompiledComponentContract = readPreparedExactCompiledComponentContract(component)
): SsrComponentExecutionBlueprint {
	const componentId = exactComponentIdentity(component);
	return Object.freeze({
		componentId,
		contract
	});
}

function linkedComponentBlueprint(
	component: AnyComponentFunction,
	contract: ExactCompiledComponentContract
): SsrComponentExecutionBlueprint {
	let blueprint = linkedBlueprints.get(contract);
	if (!blueprint) {
		blueprint = prepareComponentBlueprint(component, contract);
		linkedBlueprints.set(contract, blueprint);
	}
	return blueprint;
}

function attachedValue(component: AnyComponentFunction, key: symbol): unknown {
	return (component as unknown as Record<symbol, unknown>)[key];
}
