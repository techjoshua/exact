import type { VNode } from '@exactjs/core';

/** Projects authored VNode children into the ordinary component `children` prop. */
export function getComponentProps(vnode: VNode): Record<string, unknown> {
	const props = { ...vnode.props };
	if (vnode.children.length === 1) props.children = vnode.children[0];
	else if (vnode.children.length > 1) props.children = vnode.children;
	return props;
}

/** Returns a readable component name for SSR diagnostics and boundary metadata. */
export function componentName(type: VNode['type']): string {
	return typeof type === 'function' ? type.name || 'anonymous' : String(type);
}
