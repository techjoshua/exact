import {
	createEffectScope,
	currentEffectScope,
	registerEffectScopeCleanup
} from '@exactjs/reactive/framework/runtime';
import { createRendererRoot } from './renderer/root-construction.js';
import { updateProps } from './props.js';
import { compiledElementIdentity } from '@exactjs/core/runtime/component-operations';
/**
 * @vitest-environment jsdom
 */
import './framework/enhancements.js';
import './runtime/target.js';
import '@exactjs/core/runtime/contexts';
import { Fragment, Target, TargetOverrides, type Component } from '@exactjs/core';
import { createDynamicChild } from '@exactjs/core/runtime/render';
import { computed, flushSync, reactive } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { renderTestTree as render } from './testing.js';
import { unmount } from './index.js';
import { createOperation } from './test-support/native-operations.js';
import { roots } from './state.js';
import { releaseUnpublishedAdoption } from './renderer/teardown.js';

describe('enhancement target lifecycle', () => {
	it('mounts an independent root after its event callback disposes the previous root', () => {
		const container = document.createElement('div');
		let clicks = 0;
		try {
			render(
				createOperation(
					'button',
					{
						onClick() {
							unmount(container);
							render(createOperation('button', { onClick: () => clicks++ }, 'Current'), container);
						}
					},
					'Previous'
				),
				container
			);
			const previous = container.querySelector('button')!;
			previous.click();
			const current = container.querySelector('button')!;
			expect(current).not.toBe(previous);
			expect(current.textContent).toBe('Current');
			expect(roots.get(container)?.mounted?.scope.active).toBe(true);
			current.click();
			expect(clicks).toBe(1);
			unmount(container);
			expect(container.childNodes).toHaveLength(0);
		} finally {
			unmount(container);
		}
	});

	it('retains a current mounted range before unpublished rollback enters its scopes', () => {
		const container = document.createElement('div');
		const child: { scope?: ReturnType<typeof createEffectScope> } = {};
		let cleanups = 0;
		let scopeCleanups = 0;
		let clicks = 0;
		const refs: unknown[] = [];
		function Child(this: Component<{}>) {
			child.scope = currentEffectScope()!;
			this.onUnmount(() => cleanups++);
			return () =>
				createOperation(
					'button',
					{
						onClick: () => clicks++,
						ref: { fulfill: (value: unknown) => refs.push(value) }
					},
					'Current'
				);
		}
		try {
			render(createOperation('section', null, createOperation(Child, null)), container);
			const root = roots.get(container)!;
			const mounted = root.mounted!;
			const childScope = child.scope!;
			const button = container.querySelector('button')!;
			registerEffectScopeCleanup(childScope, () => scopeCleanups++);
			expect(mounted.scope.active).toBe(true);
			expect(childScope.active).toBe(true);
			expect(refs).toEqual([button]);

			// Internal helper contract, independent of public failed-adoption reachability.
			releaseUnpublishedAdoption(root, [mounted], new Error('unpublished rollback'));
			expect(roots.get(container)?.mounted).toBe(mounted);
			expect(mounted.scope.active).toBe(true);
			expect(childScope.active).toBe(true);
			expect(cleanups).toBe(0);
			expect(scopeCleanups).toBe(0);
			expect(container.querySelector('button')).toBe(button);
			expect(refs).toEqual([button]);
			button.click();
			expect(clicks).toBe(1);

			unmount(container);
			expect(cleanups).toBe(1);
			expect(scopeCleanups).toBe(1);
			expect(childScope.active).toBe(false);
			expect(refs).toEqual([button, undefined]);
			expect(container.childNodes).toHaveLength(0);
		} finally {
			unmount(container);
		}
	});

	it('adds and removes a ref on an initially attribute-only target without replacing its host', () => {
		const state = reactive({ observe: false });
		const values: unknown[] = [];
		const ref = { fulfill: (value: unknown) => values.push(value) };
		const container = document.createElement('div');
		render(
			createDynamicChild(() =>
				createOperation(
					Target,
					{
						title: 'owned',
						ref: state.observe ? ref : undefined,
						'DATA-EXACT-ID': 'forged',
						[compiledElementIdentity]: 'layer-id',
						[TargetOverrides]: ['data-exact-id', 'DATA-EXACT-ID']
					},
					createOperation('button', { [compiledElementIdentity]: 'physical-id' }, 'Target')
				)
			),
			container
		);
		const host = container.querySelector('button');
		expect(host?.title).toBe('owned');
		expect(host?.getAttribute('data-exact-id')).toBe('physical-id');
		expect(values).toEqual([]);
		state.observe = true;
		flushSync();
		expect(container.querySelector('button')).toBe(host);
		expect(values).toEqual([host]);
		state.observe = false;
		flushSync();
		expect(values).toEqual([host, undefined]);
		state.observe = true;
		flushSync();
		expect(values).toEqual([host, undefined, host]);
		unmount(container);
		expect(values).toEqual([host, undefined, host, undefined]);
		expect(host?.getAttribute('data-exact-id')).toBe('physical-id');
		expect(container.childNodes).toHaveLength(0);
	});

	it('cancels an update ref acquisition without reporting adoption supersession', () => {
		const state = reactive({ observe: false });
		const values: unknown[] = [];
		const reports: unknown[] = [];
		const container = document.createElement('div');
		const ref = {
			fulfill(value: unknown) {
				values.push(value);
				if (value instanceof Element) unmount(container);
			}
		};
		try {
			render(
				createDynamicChild(() =>
					createOperation(
						Target,
						{ ref: state.observe ? ref : undefined },
						createOperation('button', null, 'Target')
					)
				),
				container,
				{ onErrorReport: (report) => reports.push(report.error) }
			);
			const host = container.querySelector('button');
			state.observe = true;
			expect(() => flushSync()).not.toThrow();
			expect(reports).toEqual([]);
			expect(values).toEqual([host, undefined]);
			expect(container.childNodes).toHaveLength(0);
		} finally {
			unmount(container);
		}
	});

	it('keeps dormant target contributions and attaches them after structural output appears', () => {
		const state = reactive({ visible: false, tone: 'quiet' });
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{ className: computed(() => state.tone) },
				createDynamicChild(() =>
					state.visible ? createOperation('button', { id: 'target' }, 'Ready') : 'Waiting'
				)
			),
			container
		);

		expect(container.textContent).toBe('Waiting');
		state.visible = true;
		flushSync();
		expect(container.querySelector('button')?.className).toBe('quiet');
		state.tone = 'active';
		flushSync();
		expect(container.querySelector('button')?.className).toBe('active');
	});

	it('releases and reattaches one target owner across conditional target generations', () => {
		const state = reactive({ mode: 'button' as 'button' | 'text' | 'link' });
		const refs: unknown[] = [];
		const target = {
			fulfill(value: unknown) {
				refs.push(value);
			}
		};
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{ ref: target, title: 'owned' },
				createDynamicChild(() =>
					state.mode === 'button'
						? createOperation('button', null, 'Button')
						: state.mode === 'link'
							? createOperation('a', { href: '#' }, 'Link')
							: 'No target'
				)
			),
			container
		);

		expect(refs.at(-1)).toBe(container.querySelector('button'));
		state.mode = 'text';
		flushSync();
		expect(refs.at(-1)).toBeInstanceOf(Text);
		expect((refs.at(-1) as Text).data).toBe('No target');
		expect(container.textContent).toBe('No target');
		state.mode = 'link';
		flushSync();
		expect(refs.at(-1)).toBe(container.querySelector('a'));
		expect(container.querySelector('a')?.title).toBe('owned');
	});

	it('propagates a nested target generation change to outer target owners', () => {
		const state = reactive({ link: false });
		const outerRefs: unknown[] = [];
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{
					className: 'outer',
					ref: { fulfill: (value: unknown) => outerRefs.push(value) }
				},
				createOperation(
					Target,
					{ className: 'inner' },
					createDynamicChild(() =>
						state.link
							? createOperation('a', { href: '#' }, 'Link')
							: createOperation('button', null, 'Button')
					)
				)
			),
			container
		);

		expect(container.querySelector('button')?.className).toBe('inner outer');
		state.link = true;
		flushSync();
		expect(container.querySelector('a')?.className).toBe('inner outer');
		expect(outerRefs.at(-1)).toBe(container.querySelector('a'));
	});

	it('keeps an ordinary supplied fragment transparent without promoting its props to a descendant', () => {
		const state = reactive({ direct: true });
		const container = document.createElement('div');
		render(
			createOperation(
				Target,
				{ className: 'outer' },
				createDynamicChild(() =>
					createOperation(
						Fragment,
						null,
						state.direct ? createOperation('section', { id: 'host' }, 'Host') : 'No host',
						createOperation(Target, { className: 'inner' }, createOperation('h2', null, 'Heading'))
					)
				)
			),
			container
		);

		expect(container.querySelector('#host')?.className).toBe('');
		expect(container.querySelector('h2')?.className).toBe('inner');

		state.direct = false;
		flushSync();

		expect(container.querySelector('#host')).toBeNull();
		expect(container.querySelector('h2')?.className).toBe('inner');
	});
});

it('updates and releases physical metadata without admitting authored aliases', () => {
	const container = document.createElement('div');
	try {
		render(createOperation('button', { [compiledElementIdentity]: 'first' }, 'Ready'), container);
		const button = container.querySelector('button')!;
		render(
			createOperation(
				'button',
				{ [compiledElementIdentity]: 'second', 'DATA-EXACT-ID': 'forged' },
				'Ready'
			),
			container
		);
		expect(container.querySelector('button')).toBe(button);
		expect(button.getAttribute('data-exact-id')).toBe('second');
		render(createOperation('button', { 'data-exact-id': 'forged' }, 'Ready'), container);
		expect(container.querySelector('button')).toBe(button);
		expect(button.hasAttribute('data-exact-id')).toBe(false);
	} finally {
		unmount(container);
	}
});

it('retains same-node successor identity when the last ordinary ref cancels its old scope', () => {
	const container = document.createElement('div');
	const button = document.createElement('button');
	container.appendChild(button);
	const root = createRendererRoot(container, null, {}, { version: 1 });
	const obsolete = createEffectScope();
	const successor = createEffectScope();
	const values: unknown[] = [];
	try {
		updateProps(
			root,
			button,
			{},
			{
				[compiledElementIdentity]: 'obsolete',
				title: 'old',
				ref: {
					fulfill(value: unknown) {
						values.push(value);
						if (value !== button) return;
						obsolete.stop();
						updateProps(
							root,
							button,
							{},
							{
								title: 'current',
								[compiledElementIdentity]: 'successor'
							},
							successor,
							false
						);
					}
				}
			},
			obsolete,
			false
		);
		expect(values).toEqual([button]);
		expect(obsolete.active).toBe(false);
		expect(successor.active).toBe(true);
		expect(container.firstChild).toBe(button);
		expect(button.title).toBe('current');
		expect(button.getAttribute('data-exact-id')).toBe('successor');
	} finally {
		obsolete.stop();
		successor.stop();
	}
});
