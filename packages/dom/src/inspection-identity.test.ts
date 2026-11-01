// @vitest-environment jsdom
import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import { expect, it } from 'vitest';
import {
	createExactDomInspectionHost,
	render,
	setExactDomInspectionOwner,
	unmount
} from './index.js';
import { createCompiledComponentOperation } from './test-support/native-operations.js';
import { DomainInspectedPanel } from './test-support/components/component-domains.fixtures.js';

it('requires the complete component identity when selecting owned DOM', () => {
	const container = document.createElement('div');
	const inspection = createExactRuntimeInspectionOwner({
		buildKey: 'current-build',
		executionRoot: 'page',
		binding: 'shop'
	});
	const restore = setExactDomInspectionOwner(inspection);
	const host = createExactDomInspectionHost();
	try {
		render(createCompiledComponentOperation(DomainInspectedPanel, { label: 'current' }), container);
		host.attach('current-session', { publish() {} });
		const button = container.querySelector('button')!;
		const identity = host.ownerOfElement(button)!;
		expect(identity).toBeDefined();
		expect(host.ownedElements(identity)).toContain(button);
		const observation = host.ownedElements(identity);
		Reflect.set(observation, 'length', 0);
		expect(host.ownedElements(identity)).toContain(button);
		expect(new Set(host.ownedElements(identity)).size).toBe(host.ownedElements(identity).length);
		for (const changed of [
			{ sessionId: 'retired-session' },
			{ side: 'server' as const },
			{ binding: 'another-binding' },
			{ buildKey: 'retired-build' },
			{ componentTypeId: 'another-component' },
			{ executionRoot: 'another-root' },
			{ instanceId: 'another-instance' }
		])
			expect(host.ownedElements({ ...identity, ...changed }), JSON.stringify(changed)).toEqual([]);
		render(createCompiledComponentOperation(DomainInspectedPanel, { label: 'updated' }), container);
		expect(host.ownedElements(identity)).toContain(button);
		expect(button.textContent).toBe('updated');
		host.detach('current-session');
		expect(host.ownedElements(identity)).toEqual([]);
		host.attach('next-session', { publish() {} });
		expect(host.ownedElements(identity)).toEqual([]);
		const next = host.ownerOfElement(button)!;
		expect(host.ownedElements(next)).toContain(button);
		unmount(container);
		expect(host.ownedElements(next)).toEqual([]);
	} finally {
		host.detach();
		unmount(container);
		restore();
	}
});
