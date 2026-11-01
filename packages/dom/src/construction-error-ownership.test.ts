/** @vitest-environment jsdom */
import { it } from 'vitest';
import { render, unmount } from './index.js';
import { renderTestTree } from './testing.js';
import { createCompiledComponentOperation as componentOperation } from './test-support/native-operations.js';
import { defaultErrorContext } from '../../core/src/component/errors.js';
import * as fixtures from './test-support/roots/construction-errors.fixtures.js';
import { verifyConstructionErrors } from '../../component-composition-corpus/test-support/construction-error-journey.mjs';
it.each([
	[false, false],
	[false, true],
	[true, false],
	[true, true]
])('routes construction errors, nested=%s replacement=%s', (nested, replacement) => {
	verifyConstructionErrors(
		{ render, renderTestTree, unmount, componentOperation, defaultErrorContext },
		fixtures,
		document,
		nested,
		replacement
	);
});
