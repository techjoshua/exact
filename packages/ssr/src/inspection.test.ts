import {
	createExactRuntimeInspectionOwner,
	createVNode,
	type Component
} from '@exactjs/core';
import type { ExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';
import { describe, expect, it } from 'vitest';
import { renderToString } from './index.js';

describe('@exactjs/ssr inspection ownership', () => {
	it('inherits a request-owned sink without retaining component instances', () => {
		function Page(this: Component<{ title?: string }>) {
			this.state.title = 'Server';
			return () => createVNode('h1', null, this.state.title);
		}
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'server-build',
			executionRoot: 'page',
			side: 'server'
		});
		const events: ExactRuntimeInspectionEvent[] = [];
		inspection.attach('debug-session', { publish: (event) => events.push(event) });

		const result = renderToString(createVNode(Page, {}), { inspection });

		expect(result.html).toContain('Server');
		expect(events.map((event) => event.kind)).toEqual([
			'component.construct',
			'state.change',
			'component.unmount'
		]);
		expect(events[0]!.id).toMatchObject({
			side: 'server',
			buildKey: 'server-build',
			executionRoot: 'page',
			componentTypeId: 'Page'
		});
		expect(JSON.stringify(events)).not.toContain('<h1');
	});
});
