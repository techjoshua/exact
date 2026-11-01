import type { renderTestTree, inspectDomRoot } from '../../dom/src/testing.js';
import type { unmount } from '../../dom/src/index.js';
import type { unsafeHtml } from '@exactjs/core';
import type { componentRootLifecycle } from '../../core/src/component/root-lifecycle.js';
import type { defaultErrorContext } from '../../core/src/component/errors.js';
/** Checks public DOM range behavior and snapshots, with private root/error observations for failure detection. */
export function verifyDomRangeObservations(
	api: {
		renderTestTree: typeof renderTestTree;
		inspectDomRoot: typeof inspectDomRoot;
		unmount: typeof unmount;
		unsafeHtml: typeof unsafeHtml;
		componentRootLifecycle: typeof componentRootLifecycle;
		defaultErrorContext: typeof defaultErrorContext;
	},
	document: Document,
	count?: number
): void;
