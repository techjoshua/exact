// @vitest-environment jsdom
import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import { expect, it } from 'vitest';
import {
	createExactDomInspectionHost,
	render,
	setExactDomInspectionOwnerFactory,
	unmount
} from './index.js';
import { createCompiledComponentOperation } from './test-support/native-operations.js';
import { DomainInspectedPanel } from './test-support/components/component-domains.fixtures.js';

it('does not clear a newer installation when the same factory function is reused', () => {
	const owner = createExactRuntimeInspectionOwner({
		buildKey: 'generation-build',
		executionRoot: 'generation-root'
	});
	const factory = () => owner;
	owner.attach('factory-session', { publish() {} });
	const clearPrevious = setExactDomInspectionOwnerFactory(factory);
	const clearCurrent = setExactDomInspectionOwnerFactory(factory);
	const container = document.createElement('section');
	const afterCleanup = document.createElement('section');
	const host = createExactDomInspectionHost();
	try {
		clearPrevious();
		clearPrevious();
		render(createCompiledComponentOperation(DomainInspectedPanel, { label: 'current' }), container);
		expect(host.ownerOfElement(container.querySelector('button')!)).toMatchObject({
			sessionId: 'factory-session',
			buildKey: 'generation-build'
		});
		clearCurrent();
		render(
			createCompiledComponentOperation(DomainInspectedPanel, { label: 'cleared' }),
			afterCleanup
		);
		expect(host.ownerOfElement(afterCleanup.querySelector('button')!)).toBeUndefined();
	} finally {
		clearCurrent();
		clearPrevious();
		owner.detach();
		unmount(container);
		unmount(afterCleanup);
	}
});
