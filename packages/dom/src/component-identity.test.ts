/**
 * @vitest-environment jsdom
 */
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { describe, expect, it } from 'vitest';

describe('@exactjs/dom component identity', () => {
	it('rejects an unbranded function at the native renderer boundary', () => {
		function ForeignComponent() {}

		expect(() => createCompiledComponentReceipt(ForeignComponent, {})).toThrow(
			'Native eXact component execution requires a compiled component artifact'
		);
	});
});
