/**
 * @vitest-environment jsdom
 */
import { createVNode, type Component } from '@exact/core';
import { describe, expect, it } from 'vitest';
import { createExactClient } from './index.js';

describe('@exact/hydrate remote-registry', () => {
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
						type: 'action',
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
		client.registerManifest({
			endpoints: {
				actions: {
					'remote-save': 'https://remote.test/__exact'
				}
			},
			stateContracts: {
				'remote-save': {
					reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }]
				}
			},
			actionBoundaries: {
				'remote-save': ['remote-panel']
			}
		});

		await client.invokeAction('remote-save', { title: 'Saved' });

		expect(requests).toEqual([
			{
				input: 'https://remote.test/__exact',
				body: {
					type: 'action',
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

	it('rejects conflicting remote manifest registrations', () => {
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
				actions: {
					save: '/__exact'
				}
			},
			stateContracts: {
				save: {
					reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }]
				}
			},
			actionBoundaries: {
				save: ['profile']
			},
			islands: {
				RemoteIsland
			}
		});

		expect(() =>
			client.registerManifest({
				endpoint: 'https://remote.test/__exact'
			})
		).toThrow('Conflicting eXact hydration endpoint registration');
		expect(() =>
			client.registerManifest({
				endpoints: {
					actions: {
						save: 'https://remote.test/__exact'
					}
				}
			})
		).toThrow('Conflicting eXact hydration action endpoint route registration: save');
		expect(() =>
			client.registerManifest({
				stateContracts: {
					save: {
						reads: [{ path: 'project.title', kind: 'read', confidence: 'exact' }]
					}
				}
			})
		).toThrow('Conflicting eXact hydration state contract registration: save');
		expect(() =>
			client.registerManifest({
				actionBoundaries: {
					save: ['other-profile']
				}
			})
		).toThrow('Conflicting eXact hydration action boundary registration: save');
		expect(() =>
			client.registerManifest({
				islands: {
					RemoteIsland: OtherRemoteIsland
				}
			})
		).toThrow('Conflicting eXact hydration client island registration: RemoteIsland');
	});

	it('allows idempotent remote manifest registrations', () => {
		const container = document.createElement('div');
		function RemoteIsland(this: Component<{}>) {
			return () => createVNode('button', null, 'Remote');
		}
		const remoteFetch = async () => ({
			ok: true,
			status: 200,
			async json() {
				return { ok: true, type: 'action', id: 'save' };
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
			stateContracts: {
				'remote-save': {
					reads: [{ path: 'project.id', kind: 'read' as const, confidence: 'exact' as const }]
				}
			},
			actionBoundaries: {
				'remote-save': ['remote-panel']
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

		client.registerManifest(registration);
		client.registerManifest(registration);

		expect(client.endpoints?.boundaries?.['remote-panel']).toBe('https://remote.test/__exact');
		expect(client.stateContracts?.['remote-save']?.reads?.[0]?.path).toBe('project.id');
	});

	it('rejects cyclic state contract registrations without throwing a serialization error', () => {
		const container = document.createElement('div');
		const client = createExactClient(container, { endpoint: '/__exact' });
		const first: Record<string, unknown> = { reads: [] };
		const second: Record<string, unknown> = { reads: [] };
		first.self = first;
		second.self = second;
		client.registerManifest({ stateContracts: { save: first as never } });

		expect(() => client.registerManifest({ stateContracts: { save: second as never } })).toThrow(
			'Conflicting eXact hydration state contract registration: save'
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
		client.registerManifest({
			endpoints: {
				actions: {
					'remote-a': 'https://remote.test/__exact',
					'remote-b': 'https://remote.test/__exact'
				}
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

		await Promise.all([client.invokeAction('remote-a'), client.invokeAction('remote-b')]);

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
						{ type: 'action', id: 'remote-a' },
						{ type: 'action', id: 'remote-b' }
					]
				}
			}
		]);
	});
});
