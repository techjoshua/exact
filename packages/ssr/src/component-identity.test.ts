import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-abi';
import { describe, expect, it } from 'vitest';

describe('@exactjs/ssr component identity', () => {
	it('rejects an unbranded function at the native renderer boundary', () => {
		function ForeignComponent() {
			return () => null;
		}

		expect(() => createCompiledComponentReceipt(ForeignComponent, null)).toThrow(
			'Native eXact component execution requires a compiled component artifact'
		);
	});
});
