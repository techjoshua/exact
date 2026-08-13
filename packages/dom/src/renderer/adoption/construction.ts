import {
	createComponentInstance,
	exactComponentIdentity,
	pageComponentDomain,
	withComponentResumption,
	type ComponentContextValues,
	type ComponentFunction,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';

import { getComponentProps } from '../../children.js';

/** Constructs one component after DOM adoption has validated its server marker identity. */
export function constructAdoptedComponent(
	vnode: VNode,
	parent?: ComponentInstance<any>,
	ambientContexts?: ComponentContextValues
): ComponentInstance<any> {
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
