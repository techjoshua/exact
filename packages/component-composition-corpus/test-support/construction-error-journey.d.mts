import type { render, unmount } from '@exactjs/dom';
import type { renderTestTree } from '../../dom/src/testing.js';
import type { createCompiledComponentOperation } from '../../dom/src/test-support/native-operations.js';
import type { defaultErrorContext } from '../../core/src/component/errors.js';
import type * as Fixtures from '../../dom/src/test-support/roots/construction-errors.fixtures.js';
/** Checks compiled root and nested error routing, previous ownership release and unmount. */
export function verifyConstructionErrors(
	api: {
		render: typeof render;
		renderTestTree: typeof renderTestTree;
		unmount: typeof unmount;
		componentOperation: typeof createCompiledComponentOperation;
		defaultErrorContext: typeof defaultErrorContext;
	},
	fixtures: typeof Fixtures,
	document: Document,
	nested?: boolean,
	replacement?: boolean
): void;
