import { flushSync, watch } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { createRef } from '../keys.js';
import type { Component, RefBinding } from './contracts.js';
import { createComponentInstance } from './runtime.js';

describe('component ref bindings', () => {
	it('returns one stable binding for each component and ref key', () => {
		const key = createRef<object>('resource');
		let first!: RefBinding<object>;
		let second!: RefBinding<object>;

		function Owner(this: Component<{}>) {
			first = this.ref(key);
			second = this.ref(key);
			return () => null;
		}

		const instance = createComponentInstance(Owner, {});
		expect(first).toBe(second);
		expect(first.owner).toBe(instance);
	});

	it('publishes the same reactive current value through the binding and registry', () => {
		const key = createRef<object>('resource');
		const resource = { id: 'current' };
		let binding!: RefBinding<object>;
		let registryValue: object | undefined;
		let bindingValue: object | undefined;
		const observed = vi.fn();

		function Owner(this: Component<{}>) {
			binding = this.ref(key);
			watch(() => {
				registryValue = this.refs.get(key);
				bindingValue = binding.current;
				observed(registryValue, bindingValue);
			});
			return () => null;
		}

		createComponentInstance(Owner, {});
		expect(observed).toHaveBeenLastCalledWith(undefined, undefined);

		binding.fulfill(resource);
		flushSync();
		expect(registryValue).toBe(resource);
		expect(bindingValue).toBe(resource);
		expect(observed).toHaveBeenLastCalledWith(resource, resource);

		binding.fulfill(undefined);
		flushSync();
		expect(registryValue).toBeUndefined();
		expect(bindingValue).toBeUndefined();
	});
});
