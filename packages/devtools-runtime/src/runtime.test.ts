/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
// @vitest-environment jsdom
import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Card, accountRoot, cardRoot, counterRoot, lateRoot } from './runtime.fixtures.js';
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
	it('automatically owns roots created after an instrumented bootstrap and preserves authored styles', async () => {
		const fetchServer = vi.fn(async () => {
			throw new Error('server unavailable');
		});
		installation = installExactDevtoolsRuntime({
			buildKey: 'build-client',
			executionRoot: 'page',
			fetch: fetchServer as typeof fetch
		});
		container = document.createElement('main');
		document.body.append(container);
		render(cardRoot(), container);

		await installation.hook.connect();
		expect(fetchServer).not.toHaveBeenCalled();
		const card = document.querySelector('#card') as HTMLElement;
		const identity = installation.hook.ownerOfElement(card);
		expect(identity).toMatchObject({
			buildKey: 'build-client',
			executionRoot: 'page',
			componentTypeId: exactComponentIdentity(Card)
		});
		installation.hook.highlight(identity!);
		installation.hook.clearHighlight();
		expect(card.style.outline).toBe('1px solid red');
	});

	it('discovers optional server cooperation from compiler-owned hydration metadata', async () => {
		const hydration = document.createElement('script');
		hydration.id = '__exact_hydration';
		hydration.type = 'application/json';
		hydration.textContent = JSON.stringify({ endpoint: '/custom-exact' });
		document.head.append(hydration);
		const remoteSession = {
			id: 'server-session',
			protocol: 1 as const,
			openedAt: 1,
			expiresAt: Date.now() + 60_000,
			capabilities: ['snapshot'] as const
		};
		const fetchServer = vi.fn(
			async () =>
				new Response(JSON.stringify({ session: remoteSession }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);
		try {
			installation = installExactDevtoolsRuntime({ fetch: fetchServer as typeof fetch });

			const session = await installation.hook.connect();

			expect(session).toEqual(remoteSession);
			expect(fetchServer).toHaveBeenNthCalledWith(
				1,
				'/custom-exact',
				expect.objectContaining({ method: 'POST' })
			);
		} finally {
			hydration.remove();
		}
	});

	it('projects roots mounted after a client-only inspection session connects', async () => {
		installation = installExactDevtoolsRuntime({
			buildKey: 'late-build',
			executionRoot: 'page'
		});
		await installation.hook.connect();
		container = document.createElement('main');
		document.body.append(container);

		render(lateRoot(), container);
		const tree = await installation.hook.request({
			protocol: 1,
			id: 'late-tree',
			method: 'components.tree'
		});

		expect(tree).toMatchObject({
			ok: true,
			result: [
				{
					name: 'LateRoot',
					state: { kind: 'object' }
				}
			]
		});
	});

	it('redacts compiler-qualified state paths before snapshot traversal', async () => {
		installation = installExactDevtoolsRuntime({
			redactions: { statePaths: ['state.profile.token', 'props.token'] },
			fetch: vi.fn(async () => {
				throw new Error('server unavailable');
			}) as typeof fetch
		});
		container = document.createElement('main');
		document.body.append(container);
		render(accountRoot('Ada', 'must-never-appear'), container);
		await installation.hook.connect();

		const tree = await installation.hook.request({
			protocol: 1,
			id: 'tree',
			method: 'components.tree'
		});
		expect(JSON.stringify(tree)).not.toContain('must-never-appear');
		expect(JSON.stringify(tree)).toContain('"reason":"secret"');
		expect(JSON.stringify(tree)).toContain('Ada');
	});

	it('automatically applies compiler-emitted redaction selectors', async () => {
		(globalThis as any)[exactDevtoolsRuntimeSymbol] = {
			sources: [
				{
					protocol: 1,
					components: [],
					redactions: {
						statePaths: ['state.profile.token', 'props.token'],
						contextTokens: [],
						secretNames: []
					}
				}
			],
			registerSource(source: unknown) {
				this.sources.push(source);
			}
		};
		installation = installExactDevtoolsRuntime({
			fetch: vi.fn(async () => {
				throw new Error('server unavailable');
			}) as typeof fetch
		});
		container = document.createElement('main');
		document.body.append(container);
		render(accountRoot('Grace', 'compiler-secret-value'), container);
		await installation.hook.connect();

		const tree = await installation.hook.request({
			protocol: 1,
			id: 'tree-compiler-redaction',
			method: 'components.tree'
		});
		expect(JSON.stringify(tree)).not.toContain('compiler-secret-value');
		expect(JSON.stringify(tree)).toContain('"reason":"secret"');
		expect(JSON.stringify(tree)).toContain('Grace');
	});

	it('late-attaches to active roots and exposes only bounded read-only projections', async () => {
		const owner = createExactRuntimeInspectionOwner({
			buildKey: 'a'.repeat(40),
			executionRoot: 'page'
		});
		container = document.createElement('main');
		document.body.append(container);
		render(counterRoot(), container, { inspection: owner });

		(globalThis as any)[exactDevtoolsRuntimeSymbol] = {
			sources: [
				{
					protocol: 1,
					components: []
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
					tasks: [
						{ name: 'load' },
						{
							name: 'increment',
							activation: 'initialization'
						}
					]
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
