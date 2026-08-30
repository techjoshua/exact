/**
 * @vitest-environment jsdom
 */
import './runtime/target.js';
import {
	createComponentDomain,
	createExactRuntimeInspectionOwner,
	withComponentDomain
} from '@exactjs/core';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import {
	createExactDomInspectionHost,
	findComponentDomNode,
	findNodeOwnerInstance,
	render,
	setExactDomInspectionOwner,
	unmount
} from './index.js';
import { inspectDomRoot } from './testing.js';
import { createCompiledComponentOperation } from './test-support/native-operations.js';
import {
	DomainArea,
	DomainButtonHost,
	DomainDynamicHost,
	DomainInspectedPanel,
	DomainInspectionField,
	DomainOwnedPanel,
	DomainPageChild,
	DomainShell,
	domainOwnedPanelInstance,
	domainPageChildInstance
} from './test-support/components/component-domains.fixtures.js';

describe('component domain rendering', () => {
	it('instantiates the same compiled component under the operation owner domain', () => {
		const container = document.createElement('div');
		const page = createComponentDomain({ executionRoot: 'page' });
		const remote = createComponentDomain({ executionRoot: '@company/branding#./Button' });
		render(createCompiledComponentOperation(DomainButtonHost, { page, remote }), container);
		const buttons = Array.from(container.querySelectorAll('button'));
		expect(buttons.map((button) => button.textContent)).toEqual([
			'page',
			'@company/branding#./Button'
		]);
		unmount(container);
	});

	it('replaces rather than reuses an instance when immutable ownership changes', () => {
		const container = document.createElement('div');
		const unmounted = vi.fn();
		const page = createComponentDomain({ executionRoot: 'page' });
		const remote = createComponentDomain({ executionRoot: '@company/billing#./Area' });
		const operation = (domain: typeof page) =>
			withComponentDomain(domain, () =>
				createCompiledComponentOperation(DomainArea, { key: 'area', onUnmount: unmounted })
			);

		render(operation(page), container);
		const first = inspectDomRoot(container)?.instance;
		render(operation(remote), container);
		const second = inspectDomRoot(container)?.instance;
		expect(second).not.toBe(first);
		expect(container.textContent).toBe('@company/billing#./Area');
		expect(unmounted).toHaveBeenCalledOnce();
		unmount(container);
	});

	it('reparents a parked page instance while preserving captured context handles', () => {
		const container = document.createElement('div');
		const page = createComponentDomain({ executionRoot: 'page' });
		const firstRemote = createComponentDomain({ executionRoot: '@company/branding#./Shell' });
		const secondRemote = createComponentDomain({ executionRoot: '@company/branding#./Shell' });
		const mounted = vi.fn();
		const unmounted = vi.fn();
		const pageOperation = withComponentDomain(page, () =>
			createCompiledComponentOperation(DomainPageChild, { onMount: mounted, onUnmount: unmounted })
		);
		const shell = (domain: typeof firstRemote, tone: string) =>
			withComponentDomain(domain, () =>
				createCompiledComponentOperation(DomainShell, { tone, children: pageOperation })
			);

		render(shell(firstRemote, 'first'), container);
		const before = inspectDomRoot(container)?.instance;
		const pageBefore = domainPageChildInstance();
		expect(findComponentDomNode(pageBefore)).toBe(container.querySelector('strong'));
		render(shell(secondRemote, 'second'), container);
		const after = inspectDomRoot(container)?.instance;
		expect(after).not.toBe(before);
		expect(domainPageChildInstance()).toBe(pageBefore);
		expect(findComponentDomNode(pageBefore)).toBe(container.querySelector('strong'));
		expect(container.textContent).toBe('first');
		expect(mounted).toHaveBeenCalledOnce();
		expect(unmounted).not.toHaveBeenCalled();

		domainPageChildInstance().state.showDescendant = true;
		flushSync();
		expect(container.textContent).toBe('firstsecond');
		expect(mounted).toHaveBeenCalledOnce();
		expect(unmounted).not.toHaveBeenCalled();
		unmount(container);
		expect(unmounted).toHaveBeenCalledOnce();
	});

	it('resolves logical ownership through host ancestors and releases it on unmount', () => {
		const container = document.createElement('div');
		render(createCompiledComponentOperation(DomainOwnedPanel, null), container);
		const text = container.querySelector('span')!.firstChild!;
		expect(findNodeOwnerInstance(text)).toBe(domainOwnedPanelInstance());

		expect(unmount(container)).toBe(true);
		expect(findNodeOwnerInstance(text)).toBeUndefined();
	});

	it('carries a root inspection domain through a compiled operation', () => {
		const container = document.createElement('div');
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'compiled-root',
			executionRoot: 'page'
		});
		render(
			createCompiledComponentOperation(DomainInspectedPanel, { label: 'Inspect' }),
			container,
			{
				inspection
			}
		);

		const button = container.querySelector('button')!;
		const instance = findNodeOwnerInstance(button);
		expect(instance && componentDomainInspection(instance.domain)).toBe(inspection);
		unmount(container);
	});

	it('retains an inspected root domain across caller-authored updates', () => {
		const container = document.createElement('div');
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'stable-inspected-root',
			executionRoot: 'page'
		});
		const restoreInspection = setExactDomInspectionOwner(inspection);
		try {
			render(createCompiledComponentOperation(DomainInspectedPanel, { label: 'first' }), container);
			const first = findNodeOwnerInstance(container.querySelector('button')!);
			render(
				createCompiledComponentOperation(DomainInspectedPanel, { label: 'second' }),
				container
			);
			expect(findNodeOwnerInstance(container.querySelector('button')!)).toBe(first);
			expect(container.textContent).toBe('second');
		} finally {
			restoreInspection();
			unmount(container);
		}
	});

	it('publishes redaction-safe target contribution ownership to production inspection', () => {
		const container = document.createElement('div');
		document.body.append(container);
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'target-inspection',
			executionRoot: 'page'
		});
		const restoreInspection = setExactDomInspectionOwner(inspection);
		render(createCompiledComponentOperation(DomainInspectionField, null), container);
		const host = createExactDomInspectionHost();
		host.attach('target-inspection-session', { publish() {} });
		const snapshot = host.snapshot();
		expect(snapshot.components.map((candidate) => candidate.name)).toContain(
			'DomainInspectionField'
		);
		const component = snapshot.components.find(
			(candidate) => candidate.name === 'DomainInspectionField'
		)!;
		const contribution = component.targetContributions?.[0];

		expect(contribution?.active).toBe(true);
		expect(contribution?.target).toEqual({ tagName: 'button', connected: true });
		expect(contribution?.props.kind).toBe('object');
		expect(contribution?.effectiveProps?.kind).toBe('object');
		host.detach('target-inspection-session');
		unmount(container);
		container.remove();
		restoreInspection();
	});

	it('projects a dynamic boundary as a synthetic DevTools tree node', () => {
		const container = document.createElement('div');
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'dynamic-inspection',
			executionRoot: 'page'
		});
		const restoreInspection = setExactDomInspectionOwner(inspection);
		render(createCompiledComponentOperation(DomainDynamicHost, null), container);
		const host = createExactDomInspectionHost();
		host.attach('dynamic-inspection-session', { publish() {} });
		const dynamic = host
			.snapshot()
			.components.find((candidate) => candidate.synthetic?.kind === 'dynamic-component');

		expect(dynamic?.name).toBe('DynamicComponent');
		expect(dynamic?.synthetic).toMatchObject({
			boundaryId: 'fixture:dynamic-inspection',
			availability: 'available'
		});
		expect(dynamic?.synthetic?.adoptedComponentId).toBeTruthy();
		expect(dynamic?.parent?.componentTypeId).toBe(exactComponentIdentity(DomainDynamicHost));
		host.detach();
		unmount(container);
		restoreInspection();
	});
});
import './runtime/target.js';
import '@exactjs/core/runtime/contexts';
