// @vitest-environment jsdom
import {
	createExactRuntimeInspectionOwner,
	createVNode,
	type Component
} from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	exactDevtoolsHookSymbol,
	exactDevtoolsRuntimeSymbol,
	installExactDevtoolsRuntime
} from './runtime.js';

let installation: ReturnType<typeof installExactDevtoolsRuntime> | undefined;
let container: Element | undefined;

afterEach(async () => {
	if (container) unmount(container);
	await installation?.dispose();
	delete (globalThis as any)[exactDevtoolsHookSymbol];
	delete (globalThis as any)[exactDevtoolsRuntimeSymbol];
	container = undefined;
	installation = undefined;
	vi.restoreAllMocks();
});

describe('page-world eXact DevTools runtime', () => {
	it('late-attaches to active roots and exposes only bounded read-only projections', async () => {
		function Counter(this: Component<{ count?: number }>) {
			this.state.count = 1;
			this.task(async () => Promise.resolve());
			this.action('Increment', () => {
				this.state.count = (this.state.count ?? 0) + 1;
			});
			return () => createVNode('button', { id: 'counter' }, this.state.count);
		}
		const owner = createExactRuntimeInspectionOwner({
			buildKey: 'a'.repeat(40),
			executionRoot: 'page'
		});
		container = document.createElement('main');
		document.body.append(container);
		render(createVNode(Counter, {}), container, { inspection: owner });

		(globalThis as any)[exactDevtoolsRuntimeSymbol] = {
			sources: [
				{
					protocol: 1,
					components: [
						{
							componentTypeId: 'Counter',
							slots: [
								{ id: 'Counter:task:load', kind: 'explicit-task' },
								{ id: 'Counter:action:increment', kind: 'action' }
							]
						}
					]
				}
			],
			registerSource() {}
		};
		installation = installExactDevtoolsRuntime({
			fetch: vi.fn(async () => {
				throw new Error('server unavailable');
			}) as typeof fetch
		});
		const session = await installation.hook.connect();
		const tree = await installation.hook.request({
			protocol: 1,
			id: 'tree',
			method: 'components.tree'
		});

		expect(session.id).toMatch(/^client-/);
		expect(tree).toMatchObject({
			ok: true,
			result: [
				{
					name: 'Counter',
					state: { kind: 'object' },
					tasks: [{ id: { sourceEntityId: 'Counter:task:load' } }],
					actions: [{ id: { sourceEntityId: 'Counter:action:increment' } }]
				}
			]
		});
		expect(JSON.stringify(tree)).not.toContain('work');
		expect(JSON.stringify(tree)).not.toContain('controller');

		const button = document.querySelector('#counter')!;
		const identity = installation.hook.ownerOfElement(button);
		expect(identity?.executionRoot).toBe('page');
		installation.hook.highlight(identity!);
		expect(button.hasAttribute('data-exact-devtools-highlight')).toBe(true);
		await installation.hook.disconnect();
		expect(owner.attached).toBe(false);
	});
});
