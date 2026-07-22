import { describe, expect, it } from 'vitest';
import { getExactProvidedPackageRegistry } from './provided-packages.js';

describe('provided package registry', () => {
	it('returns the same registry through the global symbol', () => {
		expect(getExactProvidedPackageRegistry()).toBe(getExactProvidedPackageRegistry());
	});

	it('provides the exact registered module instance and permits idempotent registration', () => {
		const registry = getExactProvidedPackageRegistry();
		const module = Object.freeze({ value: Symbol('shared') });
		const key = '@fixture/provided-idempotent';
		registry.register(key, module);
		registry.register(key, module);
		expect(registry.require(key)).toBe(module);
	});

	it('rejects conflicting module instances', () => {
		const registry = getExactProvidedPackageRegistry();
		const key = '@fixture/provided-conflict';
		registry.register(key, {});
		expect(() => registry.register(key, {})).toThrow(/different module instance/);
	});

	it('reports a missing exact key with a bounded diagnostic', () => {
		const registry = getExactProvidedPackageRegistry();
		const key = `@fixture/${'x'.repeat(500)}`;
		let message = '';
		try {
			registry.require(key);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toContain('is not registered');
		expect(message.length).toBeLessThan(240);
	});
});
