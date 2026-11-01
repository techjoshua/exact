// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { verifyEventResponsibility } from '../../component-composition-corpus/test-support/event-responsibility-journey.mjs';
import { EventResponsibilityPanel } from './event-responsibility.fixtures.js';
import { render, unmount } from './index.js';
it('preserves authored focus and writes while explicit atomic regions still roll back', () => {
	expect(
		verifyEventResponsibility({
			mount(container, action, fail, errors) {
				render(
					createCompiledComponentInputReceipt(EventResponsibilityPanel, { action, fail, errors }),
					container,
					{
						onErrorReport: ({ error }) => {
							throw error;
						}
					}
				);
			},
			unmount,
			flushSync
		})
	).toEqual({ scenarios: 32 });
});
