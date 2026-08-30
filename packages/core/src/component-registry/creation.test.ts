import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { AnyComponentFunction, Component, ComponentFunction } from '../component/contracts.js';
import { createExactFrameworkFixtureArtifact } from '../testing/runtime-artifacts.js';
import {
	exactComponentIdentity,
	readExactExecutableComponentContract
} from '../component-contracts.js';
import { readCompiledComponentReceipt } from '../component-abi/receipt.js';
import { createCompiledComponentRegistry } from './creation.js';
import {
	hasComponent,
	inspectComponentRegistry,
	preloadComponent,
	renderComponent
} from './operations.js';
import { createComponentRegistry } from './syntax.js';
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

function ServerPrimary(this: Component<Record<string, never>>, props: MessageProps) {
	return () => props.message;
}

createExactFrameworkFixtureArtifact(Primary, 'fixture:registry:Primary', 'client');
createExactFrameworkFixtureArtifact(Secondary, 'fixture:registry:Secondary', 'client');
createExactFrameworkFixtureArtifact(ServerPrimary, 'fixture:registry:ServerPrimary', 'server');

describe('component registries', () => {
	it('creates a frozen null-prototype registry with stable key-specific facades', () => {
		const View = createCompiledComponentRegistry(
			'test:stable-facades',
			'StableView',
			'server',
			() => ({
				primary: ServerPrimary,
				secondary: ServerPrimary
			})
		);

		expect(Object.getPrototypeOf(View)).toBeNull();
		expect(Object.isFrozen(View)).toBe(true);
		expect(View.primary).toBe(View.primary);
		expect(View.primary).not.toBe(View.secondary);
		expect(hasComponent(View, 'primary')).toBe(true);
		expect(hasComponent(View, 'missing')).toBe(false);
		expectTypeOf<KeyOf<typeof View>>().toEqualTypeOf<'primary' | 'secondary'>();

		expect(readExactExecutableComponentContract(View.primary).artifact.id).toBe(
			'test:stable-facades:primary'
		);
		expect(readExactExecutableComponentContract(View.secondary).artifact.id).toBe(
			'test:stable-facades:secondary'
		);
	});

	it('exposes compiler-derived identity and load status without executable metadata', async () => {
		const View = createCompiledComponentRegistry('registry-id', 'View', 'client', ({ lazy }) => ({
			primary: Primary,
			secondary: lazy(async () => Secondary)
		}));
		expect(exactComponentIdentity(View.primary)).toBe('registry-id:primary');
		expect(readExactExecutableComponentContract(View.primary)).toMatchObject({
			placement: 'client',
			role: 'client',
			artifact: {
				id: 'registry-id:primary',
				instantiate: Primary,
				capabilities: ['compatibility', 'interactions', 'tasks', 'registry']
			}
		});
		expect(
			readExactExecutableComponentContract(
				createCompiledComponentRegistry('server-registry', 'ServerView', 'server', () => ({
					primary: ServerPrimary
				})).primary
			).artifact
		).toMatchObject({
			id: 'server-registry:primary',
			instantiate: ServerPrimary,
			capabilities: ['compatibility', 'interactions', 'tasks', 'registry']
		});

		expect(inspectComponentRegistry(View)).toEqual({
			id: 'registry-id',
			name: 'View',
			entries: [
				{ key: 'primary', mode: 'eager', status: 'ready', generation: 0 },
				{ key: 'secondary', mode: 'lazy', status: 'idle', generation: 0 }
			]
		});
		expect(readExactExecutableComponentContract(View.secondary).artifact).toMatchObject({
			target: 'client',
			capabilities: ['registry', 'dynamic-components']
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
		expect(() =>
			createCompiledComponentRegistry('registry-id', 'View', 'default' as 'client', () => ({
				primary: Primary
			}))
		).toThrow('target-local artifact target');
		expect(() => createComponentRegistry(() => ({ primary: Primary }))).toThrow(
			'must be compiled before execution'
		);
		expect(() =>
			createCompiledComponentRegistry(
				'registry-id',
				'View',
				'client',
				() => ({ constructor: Primary }) as unknown as { safe: typeof Primary }
			)
		).toThrow('prototype-safe');
		expect(() =>
			createCompiledComponentRegistry(
				'registry-id',
				'View',
				'client',
				() => ({ invalid: 1 }) as unknown as { invalid: AnyComponentFunction }
			)
		).toThrow('expected a component');
	});

	it('deduplicates lazy loads and keeps lazy() scoped to definition execution', async () => {
		const load = vi.fn(async () => Secondary);
		let escaped: ((load: () => Promise<typeof Secondary>) => unknown) | undefined;
		const View = createCompiledComponentRegistry(
			'test:deduplicate',
			'View',
			'client',
			(builder) => {
				escaped = builder.lazy;
				return {
					primary: Primary,
					secondary: builder.lazy(load)
				};
			}
		);

		await Promise.all([preloadComponent(View.secondary), preloadComponent(View.secondary)]);
		expect(load).toHaveBeenCalledTimes(1);
		expect(() => escaped?.(load)).toThrow('only during its definition');
	});

	it('clears failed lazy loads for explicit retry and validates callable shape', async () => {
		let attempt = 0;
		const View = createCompiledComponentRegistry('test:retry', 'View', 'client', ({ lazy }) => ({
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
		const View = createCompiledComponentRegistry('test:selection', 'View', 'client', () => ({
			primary: Primary,
			secondary: Secondary
		}));
		const selection: ComponentSelection<typeof View> = {
			component: 'secondary',
			props: { message: 'hello' }
		};

		const receipt = readCompiledComponentReceipt(renderComponent(View, selection));
		expect(receipt?.contract.artifact.id).toBe(
			readExactExecutableComponentContract(View.secondary).artifact.id
		);
		expect(receipt?.props).toEqual({ message: 'hello' });
	});
});
