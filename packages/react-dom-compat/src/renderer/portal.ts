import { rollbackReactMounts } from './teardown.js';
import type { ReactPortal } from '@exactjs/react-compat';
import type { ReactMounted, ReactRenderContext, ReactChildrenReconciler } from './types.js';

/** Mounts a React-owned portal while retaining its logical source marker. */
export function mountReactPortal(
	context: ReactRenderContext,
	portal: ReactPortal,
	reconcile: ReactChildrenReconciler
): ReactMounted {
	if (!(portal.containerInfo instanceof Node))
		throw new TypeError('React portal target must be a DOM Node');
	const marker = context.parent.ownerDocument!.createTextNode('');
	context.parent.appendChild(marker);
	const target = portal.containerInfo;
	const mounted: ReactMounted = {
		kind: 'portal',
		dom: marker,
		children: [],
		portalTarget: target
	};
	try {
		reconcile({ ...context, parent: target }, [], portal.children, null, (next) => {
			mounted.children = next;
		});
		return mounted;
	} catch (error) {
		return rollbackReactMounts([mounted], error);
	}
}
