// @vitest-environment jsdom
import { it } from 'vitest';
import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import {
	createExactDomInspectionHost,
	render,
	setExactDomInspectionOwner,
	unmount
} from './index.js';
import { createCompiledComponentOperation } from './test-support/native-operations.js';
import { DomainInspectedPanel } from './test-support/components/component-domains.fixtures.js';
import { verifyDeepPartitionInspection } from '../../component-composition-corpus/test-support/dom-partition-inspection-journey.js';
it('inspects deep partition trees with stable snapshots and bounded cleanup', () => {
	const identity = { buildKey: 'deep-inspection', executionRoot: 'page' };
	const restore = setExactDomInspectionOwner(createExactRuntimeInspectionOwner(identity));
	const host = createExactDomInspectionHost();
	const container = document.createElement('main');
	try {
		render(createCompiledComponentOperation(DomainInspectedPanel, { label: 'deep' }), container);
		host.attach('session', { publish() {} });
		verifyDeepPartitionInspection(host, container, identity);
	} finally {
		host.detach();
		unmount(container);
		restore();
	}
}, 30000);
