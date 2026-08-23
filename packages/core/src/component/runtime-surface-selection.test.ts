import { describe, expect, it } from 'vitest';
import { ComponentRuntimeSurface } from './runtime-surface.js';

describe('compiler-selected component runtime surfaces', () => {
	it('keeps optional authored operations off the durable base prototype', () => {
		const prototype = ComponentRuntimeSurface.prototype;

		expect(Object.hasOwn(prototype, 'onMount')).toBe(false);
		expect(Object.hasOwn(prototype, 'reactive')).toBe(false);
		expect(Object.hasOwn(prototype, 'map')).toBe(false);
		expect(Object.hasOwn(prototype, 'refs')).toBe(false);
		expect(Object.hasOwn(prototype, 'intl')).toBe(false);
	});
});
