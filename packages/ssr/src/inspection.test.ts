import { createExactRuntimeInspectionOwner, type Component } from '@exactjs/core';
import type { ExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';
import { handleExactRequest } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import {
	createExactServerRuntime,
	renderExactRequestToHtmlResponse,
	renderToString
} from './index.js';
import { createVNode } from './test-support/native-vnode.js';

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
			componentTypeId: '@exactjs/testing:fixture:Page:1'
		});
		expect(JSON.stringify(events)).not.toContain('<h1');
	});

	it('automatically correlates request SSR with an authorized running build', async () => {
		function Page() {
			return () => createVNode('h1', null, 'Server');
		}
		const buildKey = 'a'.repeat(40);
		const sourceHash = 'b'.repeat(64);
		const server = createExactServerRuntime({
			contract: { version: 1, invocations: {}, executors: {}, boundaries: {} },
			allowDebug: true,
			inspectionCatalogs: [
				{
					protocol: 1,
					buildKey,
					producer: {},
					roots: {
						page: {
							executionRoot: 'page',
							rootComponentId: 'Page',
							files: [
								{
									path: 'src/Page.tsx',
									sourceHash,
									components: [
										{
											id: 'Page',
											kind: 'component',
											location: {
												path: 'src/Page.tsx',
												sourceHash,
												start: { offset: 0, line: 1, column: 1 },
												end: { offset: 1, line: 1, column: 2 }
											},
											reasons: [],
											children: []
										}
									]
								}
							],
							redactions: { statePaths: [], contextTokens: [], secretNames: [] }
						}
					}
				}
			]
		});
		const opened = await handleExactRequest(
			{
				method: 'POST',
				url: '/__exact',
				body: {
					type: 'debug',
					version: 1,
					request: 'open',
					capabilities: ['events']
				}
			},
			server
		);
		const sessionId = JSON.parse(opened.body).session.id as string;

		await renderExactRequestToHtmlResponse(
			{ method: 'GET', url: '/' },
			server,
			() => createVNode(Page, {}),
			{ hydration: false, buildKey, executionRoot: 'page' }
		);
		const timeline = await handleExactRequest(
			{
				method: 'POST',
				url: '/__exact',
				body: {
					type: 'debug',
					version: 1,
					request: 'query',
					sessionId,
					query: {
						protocol: 1,
						id: 'timeline',
						method: 'timeline.query',
						params: { page: { limit: 20 } }
					}
				}
			},
			server
		);
		const events = JSON.parse(timeline.body).result as ExactRuntimeInspectionEvent[];
		expect(events.map((event) => event.kind)).toEqual(['component.construct', 'component.unmount']);
		expect(events[0]!.id).toMatchObject({ sessionId, buildKey, executionRoot: 'page' });
		await server.dispose?.();
	});
});
