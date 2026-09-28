import { expect, it } from 'vitest';
import { createExpression } from '@exactjs/core/runtime/render-operations';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from './render-output.js';
import { ScalarProp, ScheduledScalarProp } from './component-prop-values.fixtures.test.js';

it.each([
	['synchronous', ScalarProp],
	['scheduled', ScheduledScalarProp]
] as const)(
	'preserves expression values across direct server entry (%s)',
	async (_name, component) => {
		for (const value of [false, true, 0, -0, '', 'ready', null, undefined, NaN]) {
			const plain = createCompiledComponentReceipt(component, { value });
			const wrapped = createCompiledComponentReceipt(component, {
				value: createExpression(() => value)
			});
			expect((await renderToString(wrapped, { markers: false })).html).toBe(
				(await renderToString(plain, { markers: false })).html
			);
		}
	}
);
