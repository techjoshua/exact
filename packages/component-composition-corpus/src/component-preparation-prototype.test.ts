import { renderCompiledComponentRoot } from '../../dom/src/framework/component-root.js';
import { unmount } from '@exactjs/dom';
import '@exactjs/dom/runtime/target';
import { createComponentDomain, currentComponentDomain } from '@exactjs/core';
import {
	currentEffectScope,
	registerEffectScopeCleanup
} from '@exactjs/reactive/framework/runtime';
import {
	createCompiledComponentReceipt,
	readChildRangeReceipt,
	createCompiledIntrinsicReceipt,
	readCompiledComponentReceipt,
	readCompiledTargetReceipt
} from '@exactjs/core/runtime/component-operations';
import { createCompiledFragmentReceipt } from '@exactjs/core/runtime/component-abi';
import { preparedFragmentPresentation } from './prototypes/prepared-fragment.js';
import { createRendererRoot } from '../../dom/src/renderer/root-construction.js';
import { prepareComponentReceipt } from '../../dom/src/renderer/prepare-component-receipt.js';
import { placeMountedBefore } from '../../dom/src/placement.js';
import { disposeMounted } from '../../dom/src/renderer/teardown.js';
import { PreparedComponentTextTarget } from '../../dom/src/renderer/prepared-component-text.js';
import { createEffectScope, flushSync, unwrap } from '@exactjs/reactive';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DestructuredPreparedEnhancement,
	preparationAudit,
	preparationInstance,
	preparationRef,
	preparationRoot,
	transparentPreparationRoot
} from './prototypes/preparation.fixtures.js';

beforeEach(() => Object.assign(preparationAudit, { setup: 0, mounted: 0, disposed: 0 }));

describe('compiled component preparation', () => {
	it('updates destructured props and the implicit supplied child without recreating its host', () => {
		const container = document.createElement('div');
		const child = createCompiledIntrinsicReceipt('button', null, 'supplied');
		const tree = (label: string) =>
			createCompiledComponentReceipt(DestructuredPreparedEnhancement, { label }, child);
		try {
			renderCompiledComponentRoot(tree('before'), container);
			const button = container.querySelector('button');
			expect(button?.title).toBe('before');
			renderCompiledComponentRoot(tree('after'), container);
			flushSync();
			expect(container.querySelector('button')).toBe(button);
			expect(button?.title).toBe('after');
		} finally {
			unmount(container);
		}
	});
	it.each([false, true])(
		'keeps an uncontributed fragment transparent in a prepared presentation (text: %s)',
		(textMode) => {
			const operation = transparentPreparationRoot(
				createCompiledFragmentReceipt(null, 'transparent')
			);
			const container = document.createElement(textMode ? 'textarea' : 'div');
			const root = createRendererRoot(container, operation, {}, { version: 1 });
			const prepared = prepareComponentReceipt(
				root,
				readCompiledComponentReceipt(operation)!,
				undefined,
				undefined,
				container
			);
			try {
				const mounted = prepared.commit(
					textMode ? new PreparedComponentTextTarget(root) : undefined,
					preparedFragmentPresentation
				);
				try {
					placeMountedBefore(root, container, mounted);
					expect(container.textContent).toBe('transparent');
					expect(container.children).toHaveLength(0);
				} finally {
					disposeMounted(container, mounted);
				}
			} finally {
				prepared.abort();
			}
		}
	);
	it('projects the planned host literally into a textarea without publishing its Element ref', () => {
		const operation = preparationRoot(createCompiledFragmentReceipt(null, 'fragment'));
		const container = document.createElement('textarea');
		const root = createRendererRoot(container, operation, {}, { version: 1 });
		const prepared = prepareComponentReceipt(
			root,
			readCompiledComponentReceipt(operation)!,
			undefined,
			undefined,
			container
		);
		try {
			const mounted = prepared.commit(
				new PreparedComponentTextTarget(root),
				preparedFragmentPresentation
			);
			try {
				placeMountedBefore(root, container, mounted);
				const text = container.firstChild;
				expect(container.value).toBe('<span title="prepared">fragment</span>');
				expect(preparationInstance!.ref(preparationRef).current).toBeUndefined();
				preparationInstance!.state.label = 'next';
				flushSync();
				expect(container.firstChild).toBe(text);
				expect(container.value).toBe('<span title="next">fragment</span>');
				expect(container.children).toHaveLength(0);
			} finally {
				disposeMounted(container, mounted);
			}
		} finally {
			prepared.abort();
		}
	});
	it.each([undefined, 'em'])(
		'plans a contributed fragment host before publishing refs (%s)',
		(tag) => {
			const operation = preparationRoot(createCompiledFragmentReceipt(null, 'fragment'));
			const container = document.createElement('div');
			const root = createRendererRoot(container, operation, {}, { version: 1 });
			const prepared = prepareComponentReceipt(
				root,
				readCompiledComponentReceipt(operation)!,
				undefined,
				undefined,
				container
			);
			try {
				expect(preparationInstance!.ref(preparationRef).current).toBeUndefined();
				const mounted = prepared.commit(undefined, (children) =>
					preparedFragmentPresentation(children, tag)
				);
				try {
					placeMountedBefore(root, container, mounted);
					const host = container.querySelector(tag ?? 'span')!;
					expect(host.textContent).toBe('fragment');
					expect(host.getAttribute('title')).toBe('prepared');
					expect(preparationInstance!.ref(preparationRef).current).toBe(host);
					const text = [...host.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
					preparationInstance!.state.label = 'changed';
					flushSync();
					expect(container.querySelector(tag ?? 'span')).toBe(host);
					expect([...host.childNodes]).toContain(text);
					expect(host.getAttribute('title')).toBe('changed');
					expect(preparationAudit).toEqual({ setup: 1, mounted: 1, disposed: 0 });
				} finally {
					disposeMounted(container, mounted);
				}
			} finally {
				prepared.abort();
			}
			expect(preparationAudit.disposed).toBe(1);
		}
	);
	it('abandons an owner when output projection fails before native attachment', () => {
		const operation = preparationRoot(createCompiledFragmentReceipt(null, 'fragment'));
		const container = document.createElement('div');
		const domain = createComponentDomain({ executionRoot: 'preparation-test' });
		const root = createRendererRoot(
			container,
			operation,
			{ componentDomain: domain },
			{ version: 1 }
		);
		const prepared = prepareComponentReceipt(root, readCompiledComponentReceipt(operation)!);
		const failure = new Error('cannot project');
		const cleanup = vi.fn();
		try {
			expect(() =>
				prepared.commit(undefined, () => {
					expect(currentEffectScope()?.active).toBe(true);
					expect(currentComponentDomain()).toBe(domain);
					registerEffectScopeCleanup(currentEffectScope()!, cleanup);
					throw failure;
				})
			).toThrow(failure);
			expect(cleanup).toHaveBeenCalledTimes(1);
			expect(container.childNodes).toHaveLength(0);
			expect(preparationAudit).toEqual({ setup: 1, mounted: 0, disposed: 1 });
		} finally {
			prepared.abort();
		}
	});
	it('preserves a preparation failure while still disposing its constructed instance', () => {
		const operation = preparationRoot(createCompiledIntrinsicReceipt('button', null));
		const receipt = readCompiledComponentReceipt(operation)!;
		const artifact = receipt.contract.artifact;
		if (artifact.target !== 'client') throw new Error('Expected client fixture');
		const container = document.createElement('div');
		const root = createRendererRoot(container, operation, {}, { version: 1 });
		const failure = new Error('attachment failed');
		const cleanupFailure = new Error('cleanup failed');
		const originalAttach = artifact.attach;
		const originalDispose = artifact.dispose;
		const attach = vi.spyOn(artifact, 'attach').mockImplementation((...args) => {
			originalAttach.apply(artifact, args);
			throw failure;
		});
		const dispose = vi.spyOn(artifact, 'dispose').mockImplementation((...args) => {
			originalDispose.apply(artifact, args);
			throw cleanupFailure;
		});
		try {
			expect(() => prepareComponentReceipt(root, receipt, undefined, undefined, container)).toThrow(
				failure
			);
			expect(failure).toHaveProperty('suppressed', [cleanupFailure]);
			expect(dispose).toHaveBeenCalledTimes(1);
			expect(preparationAudit).toEqual({ setup: 1, mounted: 0, disposed: 1 });
			expect(container.childNodes).toHaveLength(0);
		} finally {
			attach.mockRestore();
			dispose.mockRestore();
		}
	});
	it.each([true, false])(
		'adopts matching text or abandons a mismatch without touching server text (%s)',
		(matches) => {
			const operation = preparationRoot(createCompiledIntrinsicReceipt('span', null, 'text'));
			const container = document.createElement('textarea');
			const text = document.createTextNode(
				matches ? '<span title="prepared">text</span>' : 'server mismatch'
			);
			container.append(text);
			const root = createRendererRoot(container, operation, {}, { version: 1, mode: 'hydrated' });
			const prepared = prepareComponentReceipt(
				root,
				readCompiledComponentReceipt(operation)!,
				undefined,
				undefined,
				container
			);
			try {
				if (!matches) {
					expect(() => prepared.commit(new PreparedComponentTextTarget(root, text))).toThrow(
						'does not match'
					);
					expect(text.data).toBe('server mismatch');
					expect(preparationAudit).toEqual({ setup: 1, mounted: 0, disposed: 1 });
					return;
				}
				const mounted = prepared.commit(new PreparedComponentTextTarget(root, text));
				try {
					placeMountedBefore(root, container, mounted);
					expect(container.firstChild).toBe(text);
					expect(container.childNodes).toHaveLength(1);
					expect(preparationInstance!.ref(preparationRef).current).toBeUndefined();
					expect(preparationAudit.mounted).toBe(1);
				} finally {
					disposeMounted(container, mounted);
				}
			} finally {
				prepared.abort();
			}
		}
	);
	it('commits the same prepared enhancement as text without an Element ref', () => {
		const operation = preparationRoot(createCompiledIntrinsicReceipt('span', null, 'text'));
		const container = document.createElement('textarea');
		const root = createRendererRoot(container, operation, {}, { version: 1 });
		const prepared = prepareComponentReceipt(
			root,
			readCompiledComponentReceipt(operation)!,
			undefined,
			undefined,
			container
		);
		try {
			const mounted = prepared.commit(new PreparedComponentTextTarget(root));
			try {
				placeMountedBefore(root, container, mounted);
				expect(container.value).toBe('<span title="prepared">text</span>');
				expect(container.children).toHaveLength(0);
				expect(preparationInstance!.ref(preparationRef).current).toBeUndefined();
				const text = container.firstChild;
				container.value = 'edited';
				preparationInstance!.state.label = 'next';
				flushSync();
				expect(container.firstChild).toBe(text);
				expect(container.defaultValue).toBe('<span title="next">text</span>');
				expect(container.value).toBe('edited');
				expect(preparationAudit).toEqual({ setup: 1, mounted: 1, disposed: 0 });
			} finally {
				disposeMounted(container, mounted);
			}
		} finally {
			prepared.abort();
		}
		expect(preparationAudit.disposed).toBe(1);
	});
	it('reveals contributions before placement without executing the component twice', () => {
		const operation = preparationRoot(createCompiledIntrinsicReceipt('button', null, 'target'));
		const container = document.createElement('div');
		const root = createRendererRoot(container, operation, {}, { version: 1 });
		const artifact = readCompiledComponentReceipt(operation)!.contract.artifact;
		if (artifact.target !== 'client') throw new Error('Expected client fixture');
		const attach = vi.spyOn(artifact, 'attach');
		const prepared = prepareComponentReceipt(
			root,
			readCompiledComponentReceipt(operation)!,
			undefined,
			undefined,
			container
		);
		try {
			expect(preparationAudit).toEqual({ setup: 1, mounted: 0, disposed: 0 });
			expect(container.childNodes).toHaveLength(0);
			expect(preparationInstance!.ref(preparationRef).current).toBeUndefined();
			const output = unwrap(readChildRangeReceipt(prepared.output[0])?.value ?? prepared.output[0]);
			expect(readCompiledTargetReceipt(output)?.props).toHaveProperty('title');
			const mounted = prepared.commit();
			try {
				expect(preparationAudit.mounted).toBe(0);
				placeMountedBefore(root, container, mounted);
				expect(preparationAudit).toEqual({ setup: 1, mounted: 1, disposed: 0 });
				const button = container.querySelector('button')!;
				expect(preparationInstance!.ref(preparationRef).current).toBe(button);
				expect(button.title).toBe('prepared');
				preparationInstance!.state.label = 'updated';
				flushSync();
				expect(container.querySelector('button')).toBe(button);
				expect(button.title).toBe('updated');
				expect(attach).toHaveBeenCalledTimes(1);
				expect(() => prepared.commit()).toThrow('not ready');
				prepared.abort();
				expect(preparationAudit.disposed).toBe(0);
			} finally {
				disposeMounted(container, mounted);
			}
		} finally {
			prepared.abort();
			attach.mockRestore();
		}
		expect(preparationAudit.disposed).toBe(1);
	});

	it('releases an abandoned preparation once without mount or ref publication', () => {
		const operation = preparationRoot(createCompiledIntrinsicReceipt('button', null));
		const container = document.createElement('div');
		const root = createRendererRoot(container, operation, {}, { version: 1 });
		const prepared = prepareComponentReceipt(
			root,
			readCompiledComponentReceipt(operation)!,
			undefined,
			undefined,
			container
		);
		prepared.abort();
		prepared.abort();
		expect(preparationAudit).toEqual({ setup: 1, mounted: 0, disposed: 1 });
		expect(container.childNodes).toHaveLength(0);
		expect(() => prepared.commit()).toThrow('not ready');
		expect(() => prepared.output).toThrow('not available');
	});

	it('does not commit into a stopped parent scope', () => {
		const parent = createEffectScope();
		const operation = preparationRoot(createCompiledIntrinsicReceipt('button', null));
		const container = document.createElement('div');
		const root = createRendererRoot(container, operation, {}, { version: 1 });
		const prepared = prepareComponentReceipt(
			root,
			readCompiledComponentReceipt(operation)!,
			undefined,
			parent,
			container
		);
		try {
			parent.stop();
			expect(() => prepared.commit()).toThrow('not ready');
			expect(preparationAudit.mounted).toBe(0);
		} finally {
			prepared.abort();
			parent.stop();
		}
		expect(preparationAudit.disposed).toBe(1);
	});
});
