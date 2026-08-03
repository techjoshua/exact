import { describe, expect, it } from 'vitest';
import {
	createComponentInstance,
	createContext,
	createExactRuntimeInspectionOwner,
	inspectExactRuntimeComponent,
	type Component
} from '../index.js';
import { createFrameworkComponentDomain } from './domain.js';
import type { ExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';

describe('component runtime inspection', () => {
	it('retains no pre-attachment history and emits ordered immutable lifecycle and state paths', () => {
		function Counter(this: Component<{ count?: number }>) {
			this.state.count = 1;
			return () => null;
		}
		const owner = createExactRuntimeInspectionOwner({
			buildKey: 'build',
			executionRoot: 'page'
		});
		const instance = createComponentInstance(
			Counter,
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection: owner })
		);
		const events: ExactRuntimeInspectionEvent[] = [];
		owner.attach('session', { publish: (event) => events.push(event) });

		instance.markMounted();
		instance.state.count = 2;
		instance.updateProps({});
		instance.unmount();

		expect(events.map((event) => event.kind)).toEqual([
			'component.mount',
			'component.activate',
			'state.change',
			'props.change',
			'component.unmount',
			'component.deactivate'
		]);
		expect(events[2]).toMatchObject({ path: 'state.count', sequence: 3 });
		expect(events.every(Object.isFrozen)).toBe(true);
		expect(events.some((event) => event.kind === 'component.construct')).toBe(false);
	});

	it('isolates sink failures from application mutations and lifecycle', () => {
		function Counter(this: Component<{ count?: number }>) {
			return () => null;
		}
		const owner = createExactRuntimeInspectionOwner({
			buildKey: 'build',
			executionRoot: 'page'
		});
		const instance = createComponentInstance(
			Counter,
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection: owner })
		);
		owner.attach('session', {
			publish() {
				throw new Error('diagnostic consumer failed');
			}
		});

		expect(() => {
			instance.markMounted();
			instance.state.count = 1;
			instance.unmount();
		}).not.toThrow();
	});

	it('projects public context values while redacting secret and server-resource contexts', () => {
		const Public = createContext('public-user');
		const Secret = createContext('payment-token', { keep: 'secret', scope: 'request' });
		const Resource = createContext('database', { keep: 'server', scope: 'application' });
		function Provider(this: Component<{}>) {
			this.setContext(Public, { name: 'Ada' });
			this.setContext(Secret, 'must-never-appear');
			this.setContext(Resource, { password: 'must-never-appear' });
			return () => null;
		}
		const owner = createExactRuntimeInspectionOwner({
			buildKey: 'build',
			executionRoot: 'page'
		});
		const instance = createComponentInstance(
			Provider,
			{},
			undefined,
			undefined,
			createFrameworkComponentDomain({ executionRoot: 'page', inspection: owner })
		);
		owner.attach('session', { publish() {} });

		const snapshot = inspectExactRuntimeComponent(instance)!;
		expect(snapshot.contexts).toEqual([
			expect.objectContaining({ name: 'public-user', availability: 'value' }),
			{
				name: 'payment-token',
				scope: 'request',
				availability: 'secret',
				secretName: 'payment-token'
			},
			{
				name: 'database',
				scope: 'application',
				availability: 'resource',
				type: 'server-resource'
			}
		]);
		expect(JSON.stringify(snapshot)).not.toContain('must-never-appear');
	});
});
