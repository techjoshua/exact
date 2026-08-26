import {
	type AnyComponentInstance,
	type AnyEnhancementComponentFunction,
	pageComponentDomain,
	withComponentResumption,
	type ComponentContextValues,
	type VNode
} from '@exactjs/core';
import { createComponentInstance } from '@exactjs/core/runtime/render';
import { readPreparedExactCompiledComponentContract } from '@exactjs/core/framework/component-contracts';

import { getComponentProps } from '../../children.js';

/** Constructs one component after DOM adoption has validated its server marker identity. */
export function constructAdoptedComponent(
	vnode: VNode,
	parent?: AnyComponentInstance,
	ambientContexts?: ComponentContextValues
): AnyComponentInstance {
	const contract = readPreparedExactCompiledComponentContract(
		vnode.type as AnyEnhancementComponentFunction
	);
	const domain = vnode.domain ?? parent?.domain ?? pageComponentDomain;
	return withComponentResumption(domain, () =>
		createComponentInstance(
			vnode.type as AnyEnhancementComponentFunction,
			getComponentProps(vnode),
			parent,
			parent?.ambientContexts ?? ambientContexts,
			domain,
			contract
		)
	);
}
