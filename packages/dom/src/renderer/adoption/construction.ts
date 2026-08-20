import {
	type AnyComponentInstance,
	pageComponentDomain,
	withComponentResumption,
	type ComponentContextValues,
	type ComponentFunction,
	type VNode
} from '@exactjs/core';
import { createComponentInstance } from '@exactjs/core/runtime/render';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';

import { getComponentProps } from '../../children.js';

/** Constructs one component after DOM adoption has validated its server marker identity. */
export function constructAdoptedComponent(
	vnode: VNode,
	parent?: AnyComponentInstance,
	ambientContexts?: ComponentContextValues
): AnyComponentInstance {
	exactComponentIdentity(vnode.type as ComponentFunction<any, Record<string, unknown>>);
	const domain = vnode.domain ?? parent?.domain ?? pageComponentDomain;
	return withComponentResumption(domain, () =>
		createComponentInstance(
			vnode.type as ComponentFunction<any, Record<string, unknown>>,
			getComponentProps(vnode),
			parent,
			parent?.ambientContexts ?? ambientContexts,
			domain
		)
	);
}
