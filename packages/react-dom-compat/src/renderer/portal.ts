import type { ReactNode, ReactPortal } from '@exactjs/react-compat';
import type { ReactMounted, ReactRenderContext } from './types.js';

/** Mounts a React-owned portal while retaining its logical source marker. */
export function mountReactPortal(
	context: ReactRenderContext,
	portal: ReactPortal,
	reconcile: (
		context: ReactRenderContext,
		previous: readonly ReactMounted[],
		value: ReactNode
	) => ReactMounted[]
): ReactMounted {
	if (!(portal.containerInfo instanceof Node))
		throw new TypeError('React portal target must be a DOM Node');
	const marker = context.parent.ownerDocument!.createTextNode('');
	context.parent.appendChild(marker);
	const target = portal.containerInfo;
	return {
		kind: 'portal',
		dom: marker,
		...(portal.key === null ? {} : { key: String(portal.key) }),
		children: reconcile({ ...context, parent: target }, [], portal.children),
		portalTarget: target
	};
}
