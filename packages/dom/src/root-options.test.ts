// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import { renderCompiledIntrinsicRoot } from './framework/intrinsic-root.js';
import { render, unmount, setExactDomInspectionOwnerFactory } from './index.js';
import { createCompiledComponentOperation } from './test-support/native-operations.js';
import { DomainInspectedPanel } from './test-support/components/component-domains.fixtures.js';
import { verifyDomRootOptions } from '../../component-composition-corpus/test-support/dom-root-options-journey.mjs';
it('preserves inherited work limits and callbacks with explicit and ambient inspection', () => {
	expect(
		verifyDomRootOptions({
			Panel: DomainInspectedPanel,
			operation: createCompiledComponentOperation,
			intrinsic: createCompiledIntrinsicReceipt,
			renderIntrinsic: renderCompiledIntrinsicRoot,
			render,
			unmount,
			createExactRuntimeInspectionOwner,
			setExactDomInspectionOwnerFactory
		})
	).toBe(true);
});
