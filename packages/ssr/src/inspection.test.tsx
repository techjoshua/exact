import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import type { ExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';
import { handleExactRequest } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import {
	createExactServerRuntime,
	renderExactRequestToHtmlResponse,
	renderToString
} from './index.js';
import { createOperation } from './test-support/native-operations.js';
import { InspectablePage, StaticServerPage } from './inspection.fixtures.test.js';

describe('@exactjs/ssr inspection ownership', () => {
	it('publishes compiler-backed request snapshots without retaining component instances', () => {
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'server-build',
			executionRoot: 'page',
			side: 'server'
		});
		const events: ExactRuntimeInspectionEvent[] = [];
		inspection.attach('debug-session', { publish: (event) => events.push(event) });

		const snapshots: Array<{ phase: string; state: Readonly<Record<string, unknown>> }> = [];
		const result = renderToString(createOperation(InspectablePage, {}), {
			inspection,
			onDirectComponentCreated: (snapshot) =>
				snapshots.push({ phase: 'created', state: { ...snapshot.state } }),
			onDirectComponentRendered: (snapshot) =>
				snapshots.push({ phase: 'rendered', state: { ...snapshot.state } })
		});

		expect(result.html).toContain('Server');
		expect(snapshots).toEqual([
			{ phase: 'created', state: { title: 'Server' } },
			{ phase: 'rendered', state: { title: 'Server' } }
		]);
		expect(events).toEqual([]);
		expect(JSON.stringify(events)).not.toContain('<h1');
	});

	it('does not retain request SSR observations in the reusable server runtime', async () => {
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

		const rendered = await renderExactRequestToHtmlResponse(
			{ method: 'GET', url: '/' },
			server,
			() => createOperation(StaticServerPage, {}),
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
		expect(rendered.body).toContain('Server');
		expect(timeline.status).toBe(404);
		expect(JSON.parse(timeline.body)).toMatchObject({ reason: 'timeline-is-browser-owned' });
		await server.dispose?.();
	});
});
