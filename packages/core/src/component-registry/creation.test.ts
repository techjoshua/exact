import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { AnyComponentFunction, Component, ComponentFunction } from '../component/contracts.js';
import { createComponentInstance } from '../component/runtime.js';
import { renderInstance } from '../component/render.js';
import { isVNode } from '../vnode.js';
import {
	createComponentRegistry,
	createCompiledComponentRegistry,
	hasComponent,
	inspectComponentRegistry,
	preloadComponent,
	renderComponent
} from './creation.js';
import type { ComponentSelection, KeyOf } from './contracts.js';

type MessageProps = {
	message: string;
};

function Primary(this: Component<Record<string, never>>, props: MessageProps) {
	return () => props.message;
}

function Secondary(this: Component<Record<string, never>>, props: MessageProps) {
	return () => props.message;
}

describe('component registries', () => {
	it('creates a frozen null-prototype registry with stable key-specific facades', () => {
		const View = createComponentRegistry(() => ({
			primary: Primary,
			secondary: Primary
		}));

		expect(Object.getPrototypeOf(View)).toBeNull();
		expect(Object.isFrozen(View)).toBe(true);
		expect(View.primary).toBe(View.primary);
		expect(View.primary).not.toBe(View.secondary);
		expect(hasComponent(View, 'primary')).toBe(true);
		expect(hasComponent(View, 'missing')).toBe(false);
		expectTypeOf<KeyOf<typeof View>>().toEqualTypeOf<'primary' | 'secondary'>();

		const primary = createComponentInstance(View.primary, { message: 'one' });
		const secondary = createComponentInstance(View.secondary, { message: 'two' });
		const primaryChild = renderInstance(primary, () => undefined)[0];
		const secondaryChild = renderInstance(secondary, () => undefined)[0];
		expect(typeof primaryChild).toBe('object');
		expect(typeof secondaryChild).toBe('object');
		expect((primaryChild as { key?: string }).key).toBe('exact-registry:primary');
		expect((secondaryChild as { key?: string }).key).toBe('exact-registry:secondary');
		primary.unmount();
		secondary.unmount();
	});

	it('exposes compiler-derived identity and load status without executable metadata', async () => {
		const View = createCompiledComponentRegistry('registry-id', 'View', ({ lazy }) => ({
			primary: Primary,
			secondary: lazy(async () => Secondary)
		}));

		expect(inspectComponentRegistry(View)).toEqual({
			id: 'registry-id',
			name: 'View',
			entries: [
				{ key: 'primary', mode: 'eager', status: 'ready', generation: 0 },
				{ key: 'secondary', mode: 'lazy', status: 'idle', generation: 0 }
			]
		});
		await preloadComponent(View.secondary);
		expect(inspectComponentRegistry(View).entries[1]).toEqual({
			key: 'secondary',
			mode: 'lazy',
			status: 'ready',
			generation: 1
		});
	});

	it('rejects empty, unsafe, and non-component definitions', () => {
		expect(() => createComponentRegistry(() => ({}))).toThrow('at least one');
		expect(() =>
			createComponentRegistry(
				() => ({ constructor: Primary }) as unknown as { safe: typeof Primary }
			)
		).toThrow('prototype-safe');
		expect(() =>
			createComponentRegistry(
				() => ({ invalid: 1 }) as unknown as { invalid: AnyComponentFunction }
			)
		).toThrow('expected a component');
	});

	it('deduplicates lazy loads and keeps lazy() scoped to definition execution', async () => {
		const load = vi.fn(async () => Secondary);
		let escaped: ((load: () => Promise<typeof Secondary>) => unknown) | undefined;
		const View = createComponentRegistry((builder) => {
			escaped = builder.lazy;
			return {
				primary: Primary,
				secondary: builder.lazy(load)
			};
		});

		await Promise.all([preloadComponent(View.secondary), preloadComponent(View.secondary)]);
		expect(load).toHaveBeenCalledTimes(1);
		expect(() => escaped?.(load)).toThrow('only during its definition');
	});

	it('clears failed lazy loads for explicit retry and validates callable shape', async () => {
		let attempt = 0;
		const View = createComponentRegistry(({ lazy }) => ({
			retry: lazy(async () => {
				if (attempt++ === 0) throw new Error('temporary');
				return Secondary;
			}),
			invalid: lazy(
				async () => 42 as unknown as ComponentFunction<Record<string, never>, MessageProps>
			)
		}));

		await expect(preloadComponent(View.retry)).rejects.toThrow('temporary');
		await expect(preloadComponent(View.retry)).resolves.toBeUndefined();
		expect(attempt).toBe(2);
		await expect(preloadComponent(View.invalid)).rejects.toThrow('did not resolve to a component');
	});

	it('renders a correlated heterogeneous selection without losing props', () => {
		const View = createComponentRegistry(() => ({
			primary: Primary,
			secondary: Secondary
		}));
		const selection: ComponentSelection<typeof View> = {
			component: 'secondary',
			props: { message: 'hello' }
		};

		const vnode = renderComponent(View, selection);
		expect(isVNode(vnode)).toBe(true);
		expect(vnode.type).toBe(View.secondary);
		expect(vnode.props).toEqual({ message: 'hello' });
	});
});
