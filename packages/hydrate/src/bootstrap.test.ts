/**
 * @vitest-environment jsdom
 */
import { type Component } from '@exactjs/core';
import { flushSync, registerReactiveListKey } from '@exactjs/reactive';
import { renderHydrationScript, renderToHydratableString } from '@exactjs/ssr';
import { expect, it } from 'vitest';
import { defineExactHydrationRegistration, hydrate, readExactHydrationConfig } from './index.js';
import { resolveHydrateOptions } from './config.js';
import { createVNode } from './test-support/native-vnode.js';

it('reports opt-in hydration timings', () => {
	function Profiled() {
		return () => createVNode('p', null, 'profiled');
	}
	const vnode = createVNode(Profiled, null);
	const container = document.createElement('div');
	container.innerHTML = renderToHydratableString(vnode).htmlWithHydration;
	const events: Array<{ subsystem: string; phase: string }> = [];

	hydrate(vnode, container, { onProfile: (event) => events.push(event) });

	expect(events).toContainEqual(
		expect.objectContaining({
			subsystem: 'hydrate',
			phase: 'hydrate'
		})
	);
	expect(events.map((event) => event.phase)).toEqual(
		expect.arrayContaining(['capture-dom', 'adopt-dom', 'restore-controls'])
	);
});

it('adopts a complete authored document while retaining framework-owned body augmentation', () => {
	function DocumentApp(this: Component<{ count: number }>) {
		this.state.count = 1;
		return () =>
			createVNode(
				'html',
				{ lang: 'en' },
				createVNode('head', null, createVNode('title', null, `Count ${this.state.count}`)),
				createVNode(
					'body',
					null,
					createVNode(
						'button',
						{
							onClick: () => {
								this.state.count++;
							}
						},
						`Count ${this.state.count}`
					)
				)
			);
	}

	const rendered = renderToHydratableString(createVNode(DocumentApp, null), {
		endpoint: '/__exact'
	});
	document.open();
	document.write(rendered.htmlWithHydration);
	document.close();
	const originalHtml = document.documentElement;
	const frameworkScript = document.getElementById('__exact_hydration');

	const client = hydrate(createVNode(DocumentApp, null), document, { onMismatch: 'throw' });

	expect(document.documentElement).toBe(originalHtml);
	expect(document.getElementById('__exact_hydration')).toBe(frameworkScript);
	const button = document.querySelector('button')!;
	button.click();
	flushSync();
	expect(button.textContent).toBe('Count 2');
	expect(document.title).toBe('Count 2');
	expect(frameworkScript?.previousSibling).toBeInstanceOf(Comment);
	expect((frameworkScript?.previousSibling as Comment).data).toBe('exact:framework-body:start');
	client.dispose();
	document.open();
	document.write('<!doctype html><html><head></head><body></body></html>');
	document.close();
});

it('decodes keyed hydration collection envelopes into ordinary arrays', () => {
	const records = [
		{ id: 'a', title: 'A' },
		{ id: 'b', title: 'B' }
	];
	registerReactiveListKey(
		records,
		(item) => (item as { id: string }).id,
		'hydrate config test',
		'member:id'
	);
	const root = document.createElement('div');
	root.innerHTML = renderHydrationScript({ state: { records } });
	const config = readExactHydrationConfig(root);
	expect((config.state as any).records).toEqual(records);
	expect(Array.isArray((config.state as any).records)).toBe(true);
	expect(Object.keys((config.state as any).records)).toEqual(['0', '1']);
});

it('retains generated action invocation metadata from serialized hydration config', () => {
	const continuation = {
		kind: 'task' as const,
		id: 'action:quote',
		componentId: 'component:Workspace',
		readiness: 'nonblocking' as const,
		dependencies: [{ source: 'argument' as const }],
		invocation: {
			arguments: [{ source: 'argument' as const }],
			concurrency: 'parallel' as const
		},
		stateReads: [],
		stateWrites: [],
		publicContexts: [],
		serverContexts: [],
		contextWrites: [],
		serverContextWrites: [],
		boundaries: []
	};
	const root = document.createElement('div');
	root.innerHTML = renderHydrationScript({
		continuations: { [continuation.id]: continuation }
	});
	const { serverContextWrites: _, ...browserContinuation } = continuation;

	expect(readExactHydrationConfig(root).continuations?.[continuation.id]).toEqual(
		browserContinuation
	);
});

it('uses the core continuation contract for collection state paths', () => {
	const root = document.createElement('div');
	root.innerHTML = renderHydrationScript({
		continuations: {
			'action:collection': {
				kind: 'task',
				id: 'action:collection',
				componentId: 'component:Workspace',
				readiness: 'nonblocking',
				dependencies: [],
				stateReads: [{ path: 'records', kind: 'read', confidence: 'exact', operation: 'map' }],
				stateWrites: [],
				publicContexts: [],
				serverContexts: [],
				contextWrites: [],
				serverContextWrites: [],
				boundaries: []
			}
		}
	});

	expect(readExactHydrationConfig(root).continuations?.['action:collection']?.stateReads).toEqual([
		{ path: 'records', kind: 'read', confidence: 'exact', operation: 'map' }
	]);
});

it('normalizes omitted hydration metadata to shared immutable defaults', () => {
	const sparse = {
		kind: 'task' as const,
		id: 'action:sparse',
		componentId: 'component:Workspace',
		readiness: 'nonblocking' as const
	};
	const registration = defineExactHydrationRegistration({
		continuations: {
			[sparse.id]: sparse,
			'action:other': { ...sparse, id: 'action:other' }
		},
		resumptions: [{ componentId: 'component:Workspace' }]
	});
	const first = registration.continuations![sparse.id]!;
	const second = registration.continuations!['action:other']!;
	const resumption = registration.resumptions![0]!;

	for (const value of [
		first.dependencies,
		first.stateReads,
		first.stateWrites,
		first.publicContexts,
		first.serverContexts,
		first.contextWrites,
		first.boundaries
	]) {
		expect(value).toEqual([]);
		expect(Object.isFrozen(value)).toBe(true);
	}
	expect(first.dependencies).toBe(second.dependencies);
	expect(first.serverContextWrites).toBeUndefined();
	expect(resumption.values).toBe(resumption.contexts);
	expect(resumption.values).toEqual({});
	expect(Object.isFrozen(resumption.values)).toBe(true);
	expect(resumption.settledContinuations).toBe(first.dependencies);
});

it('checks paired component authorization and sends only its fingerprint', () => {
	const root = document.createElement('div');
	root.innerHTML = renderHydrationScript({
		componentAuthorization: {
			protocol: 1,
			buildKey: 'build-one',
			fingerprint: 'authorization-one'
		}
	});

	expect(() =>
		resolveHydrateOptions(root, {
			componentAuthorization: {
				protocol: 1,
				buildKey: 'build-one',
				fingerprint: 'authorization-two'
			}
		})
	).toThrow('authorization fingerprints do not match');
	expect(resolveHydrateOptions(root, {}).headers).toEqual({
		'X-Exact-Component-Authorization': 'authorization-one'
	});
	expect(() => resolveHydrateOptions(root, { buildKey: 'another-build' })).toThrow(
		'does not match the hydration build key'
	);
});
