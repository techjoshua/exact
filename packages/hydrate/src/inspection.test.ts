/**
 * @vitest-environment jsdom
 */
import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import type { ExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { inspectionPageRoot as serverInspectionPageRoot } from './test-support/inspection.fixtures.js?exact-target=server';
import { inspectionPageRoot as clientInspectionPageRoot } from './test-support/inspection.fixtures.js';
import { hydrate } from './index.js';

describe('@exactjs/hydrate inspection ownership', () => {
	it('emits root hydration activation through the inherited component domain', () => {
		const container = document.createElement('div');
		container.innerHTML = renderToString(serverInspectionPageRoot).html;
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'client-build',
			executionRoot: 'page'
		});
		const events: ExactRuntimeInspectionEvent[] = [];
		inspection.attach('session', { publish: (event) => events.push(event) });

		const root = hydrate(clientInspectionPageRoot, container, { inspection });

		expect(events.map((event) => event.kind)).toEqual(
			expect.arrayContaining([
				'component.construct',
				'hydration.activate',
				'component.mount',
				'component.activate'
			])
		);
		expect(events.find((event) => event.kind === 'hydration.activate')?.id).toMatchObject({
			buildKey: 'client-build',
			executionRoot: 'page'
		});
		root.dispose();
	});
});
