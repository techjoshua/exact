import { type VNode } from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentType,
	readExactComponentContract,
	type ExactComponentContract
} from '@exactjs/core/framework/component-contracts';
import {
	createPreparedComponentInstance,
	prepareComponentExecution,
	type PreparedComponentExecution
} from '@exactjs/core/framework/component-execution';
import type { ComponentFunction, ComponentInstance, SsrContext } from '../types.js';

/** Validated component metadata cached beneath one SSR root component. */
export type SsrComponentExecutionBlueprint = Readonly<{
	componentId?: string;
	contract?: ExactComponentContract;
	execution?: PreparedComponentExecution;
}>;

/** Root-scoped cache whose weak expansion entries accommodate dynamic component selection. */
export type SsrRootExecutionBlueprint = {
	resolve(component: ComponentFunction<any>): SsrComponentExecutionBlueprint;
};

const rootBlueprints = new WeakMap<ComponentFunction<any>, SsrRootExecutionBlueprint>();

/** Attaches the reusable blueprint for a component root after output extensions select it. */
export function attachSsrRootExecutionBlueprint(context: SsrContext, vnode: VNode): void {
	if (typeof vnode.type !== 'function') return;
	context.rootExecutionBlueprint = ssrRootExecutionBlueprint(vnode.type);
}

/** Resolves cached validated metadata for one component reached beneath the active root. */
export function resolveSsrComponentExecution(
	context: SsrContext,
	component: ComponentFunction<any>
): SsrComponentExecutionBlueprint {
	return context.rootExecutionBlueprint?.resolve(component) ?? prepareComponentBlueprint(component);
}

/** Constructs a component without repeating contract validation or plan indexing. */
export function createSsrComponentInstance<
	State extends object,
	Props extends Record<string, unknown>
>(
	context: SsrContext,
	component: ComponentFunction<State, Props>,
	props: Props,
	parent: ComponentInstance<any> | undefined,
	blueprint = resolveSsrComponentExecution(context, component)
): ComponentInstance<State> {
	return createPreparedComponentInstance(
		component,
		props,
		blueprint.execution,
		parent,
		context.componentContexts,
		context.componentDomain
	);
}

/** Returns the stable cache object owned by one root component function. */
export function ssrRootExecutionBlueprint(root: ComponentFunction<any>): SsrRootExecutionBlueprint {
	let blueprint = rootBlueprints.get(root);
	if (!blueprint) {
		const components = new WeakMap<ComponentFunction<any>, CachedBlueprint>();
		blueprint = {
			resolve(component) {
				const rawContract = attachedValue(component, exactComponentContract);
				const componentId = attachedValue(component, exactComponentType);
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
	componentId: unknown;
	blueprint: SsrComponentExecutionBlueprint;
}>;

function prepareComponentBlueprint(
	component: ComponentFunction<any>
): SsrComponentExecutionBlueprint {
	const contract = readExactComponentContract(component);
	const componentId = attachedValue(component, exactComponentType);
	return Object.freeze({
		...(typeof componentId === 'string' ? { componentId } : {}),
		...(contract ? { contract } : {}),
		...(contract?.execution ? { execution: prepareComponentExecution(contract.execution) } : {})
	});
}

function attachedValue(component: ComponentFunction<any>, key: symbol): unknown {
	return (component as unknown as Record<symbol, unknown>)[key];
}
