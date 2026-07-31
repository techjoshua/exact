/**
 * @vitest-environment jsdom
 */
import { type Component } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { createExactClient } from './index.js';
import { testContinuation } from './test-support/responses.js';
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/hydrate remote-registry', () => {
	it('registers remote hydration metadata after client creation', async () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:remote-panel--><p>Old remote</p><!--/exact:remote-panel-->';
		const requests: { input: string; body: unknown }[] = [];
		const fetch = async (input: string, init: { body: string }) => {
			requests.push({ input, body: JSON.parse(init.body) });
			return {
				ok: true,
				status: 200,
				async json() {
					return {
						ok: true,
						type: 'invoke',
						id: 'remote-save',
						patches: [
							{ type: 'replace', id: 'remote-panel', html: '<section>Saved remote</section>' }
						],
						state: { project: { id: 'p1', title: 'Saved' } }
					};
				}
			};
		};

		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: { project: { id: 'p1', title: 'Draft', secret: 'local-only' } },
			fetch
		});
		client.registerComponents({
			endpoints: {
				invocations: {
					'remote-save': 'https://remote.test/__exact'
				}
			},
			continuations: {
				'remote-save': testContinuation('remote-save', {
					reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
					boundaries: ['remote-panel']
				})
			}
		});

		await client.invokeTask('remote-save', { title: 'Saved' });

		expect(requests).toEqual([
			{
				input: 'https://remote.test/__exact',
				body: {
					type: 'invoke',
					root: 'page',
					id: 'remote-save',
					payload: { title: 'Saved' },
					state: { project: { id: 'p1' } },
					boundaryHtmls: {
						'remote-panel': '<p>Old remote</p>'
					}
				}
			}
		]);
		expect(client.state).toEqual({ project: { id: 'p1', title: 'Saved' } });
		expect(container.textContent).toBe('Saved remote');
	});

	it('rejects conflicting remote component registrations', () => {
		const container = document.createElement('div');
		function RemoteIsland(this: Component<{}>) {
			return () => createVNode('button', null, 'Remote');
		}
		function OtherRemoteIsland(this: Component<{}>) {
			return () => createVNode('button', null, 'Other');
		}

		const client = createExactClient(container, {
			endpoint: '/__exact',
			endpoints: {
				invocations: {
					save: '/__exact'
				}
			},
			continuations: {
				save: testContinuation('save', {
					reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
					boundaries: ['profile']
				})
			},
			islands: {
				RemoteIsland
			}
		});

		expect(() =>
			client.registerComponents({
				endpoint: 'https://remote.test/__exact'
			})
		).toThrow('Conflicting eXact hydration endpoint registration');
		expect(() =>
			client.registerComponents({
				endpoints: {
					invocations: {
						save: 'https://remote.test/__exact'
					}
				}
			})
		).toThrow('Conflicting eXact hydration invocation endpoint route registration: save');
		expect(() =>
			client.registerComponents({
				continuations: {
					save: testContinuation('save', {
						reads: [{ path: 'project.title', kind: 'read', confidence: 'exact' }],
						boundaries: ['profile']
					})
				}
			})
		).toThrow('Conflicting eXact hydration continuation registration: save');
		expect(() =>
			client.registerComponents({
				continuations: {
					save: testContinuation('save', {
						reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
						boundaries: ['other-profile']
					})
				}
			})
		).toThrow('Conflicting eXact hydration continuation registration: save');
		expect(() =>
			client.registerComponents({
				islands: {
					RemoteIsland: OtherRemoteIsland
				}
			})
		).toThrow('Conflicting eXact hydration client island registration: RemoteIsland');
	});

	it('allows idempotent remote component registrations', () => {
		const container = document.createElement('div');
		function RemoteIsland(this: Component<{}>) {
			return () => createVNode('button', null, 'Remote');
		}
		const remoteFetch = async () => ({
			ok: true,
			status: 200,
			async json() {
				return { ok: true, type: 'invoke', id: 'save' };
			}
		});

		const client = createExactClient(container, {
			endpoint: '/__exact'
		});
		const registration = {
			endpoints: {
				boundaries: {
					'remote-panel': 'https://remote.test/__exact'
				}
			},
			continuations: {
				'remote-save': testContinuation('remote-save', {
					reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
					boundaries: ['remote-panel']
				})
			},
			islands: {
				RemoteIsland
			},
			transports: {
				'https://remote.test/__exact': {
					fetch: remoteFetch,
					headers: {
						'x-remote': '1'
					}
				}
			}
		};

		client.registerComponents(registration);
		client.registerComponents(registration);

		expect(client.endpoints?.boundaries?.['remote-panel']).toBe('https://remote.test/__exact');
		expect(client.continuations?.['remote-save']?.stateReads[0]?.path).toBe('project.id');
	});

	it('rejects cyclic continuation registrations without throwing a serialization error', () => {
		const container = document.createElement('div');
		const client = createExactClient(container, { endpoint: '/__exact' });
		const first: Record<string, unknown> = { ...testContinuation('save') };
		const second: Record<string, unknown> = { ...testContinuation('save') };
		first.self = first;
		second.self = second;
		client.registerComponents({ continuations: { save: first as never } });

		expect(() => client.registerComponents({ continuations: { save: second as never } })).toThrow(
			'Conflicting eXact hydration continuation registration: save'
		);
	});

	it('uses endpoint-specific transports for registered remote operations', async () => {
		const container = document.createElement('div');
		const remoteRequests: { input: string; headers: Record<string, string>; body: unknown }[] = [];
		const rootFetch = async () => {
			throw new Error('root fetch should not receive remote operations');
		};
		const remoteFetch = async (
			input: string,
			init: { headers: Record<string, string>; body: string }
		) => {
			remoteRequests.push({ input, headers: init.headers, body: JSON.parse(init.body) });
			return {
				ok: true,
				status: 200,
				async json() {
					const body = JSON.parse(init.body);
					return {
						ok: true,
						version: 1,
						results: body.operations.map((operation: { type: string; id: string }) => ({
							ok: true,
							type: operation.type,
							id: operation.id,
							patches: []
						}))
					};
				}
			};
		};

		const client = createExactClient(container, {
			endpoint: '/__exact',
			fetch: rootFetch,
			headers: {
				'x-root': 'root',
				'x-shared': 'root'
			}
		});
		client.registerComponents({
			endpoints: {
				invocations: {
					'remote-a': 'https://remote.test/__exact',
					'remote-b': 'https://remote.test/__exact'
				}
			},
			continuations: {
				'remote-a': testContinuation('remote-a'),
				'remote-b': testContinuation('remote-b')
			},
			transports: {
				'https://remote.test/__exact': {
					fetch: remoteFetch,
					headers: {
						'x-remote': 'remote',
						'x-shared': 'remote'
					}
				}
			}
		});

		await Promise.all([client.invokeTask('remote-a'), client.invokeTask('remote-b')]);

		expect(remoteRequests).toEqual([
			{
				input: 'https://remote.test/__exact',
				headers: {
					'content-type': 'application/json',
					'x-root': 'root',
					'x-shared': 'remote',
					'x-remote': 'remote'
				},
				body: {
					type: 'batch',
					version: 1,
					operations: [
						{ type: 'invoke', root: 'page', id: 'remote-a' },
						{ type: 'invoke', root: 'page', id: 'remote-b' }
					]
				}
			}
		]);
	});
});
