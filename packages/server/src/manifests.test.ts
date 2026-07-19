import { describe, expect, it } from 'vitest';
import {
	createExactHydrationActionBoundaries,
	createExactHydrationManifestConfig,
	createExactHydrationStateContracts,
	createExactServerManifest,
	handleExactRequest
} from './index.js';
import { context } from './test-support/server.js';

describe('@exact/server manifests', () => {
	it('rejects unsupported compiler manifest versions', () => {
		expect(() =>
			createExactServerManifest({
				version: -1,
				components: []
			} as any)
		).toThrow('Unsupported eXact compiler manifest version: -1');
	});

	it('rejects malformed compiler manifests before creating allowlists', () => {
		expect(() =>
			createExactServerManifest({
				version: 1,
				serverActions: {
					action: {
						id: 1,
						placement: 'server'
					}
				}
			} as any)
		).toThrow('Malformed eXact compiler manifest');

		expect(() =>
			createExactServerManifest({
				version: 1,
				components: [{ id: 'Panel', placement: 'browser' }]
			} as any)
		).toThrow('Malformed eXact compiler manifest');

		expect(() =>
			createExactServerManifest({
				version: 1,
				serverActions: {
					action: {
						id: 'action',
						placement: 'server',
						stateContract: {
							reads: [{ path: 'project.id', kind: 'inspect', confidence: 'exact' }]
						}
					}
				}
			} as any)
		).toThrow('Malformed eXact compiler manifest');

		expect(() =>
			createExactServerManifest({
				version: 1,
				boundaries: [
					{
						id: 'panel',
						renderEdgeIndex: 0
					}
				]
			} as any)
		).toThrow('Malformed eXact compiler manifest');

		expect(() =>
			createExactServerManifest({
				version: 1,
				serverActions: {
					action: {
						id: 'action',
						placement: 'server',
						contextContract: [{ token: 'AuthContext', kind: 'inspect', confidence: 'exact' }]
					}
				}
			} as any)
		).toThrow('Malformed eXact compiler manifest');
	});

	it('rejects malformed endpoint route maps', () => {
		expect(() =>
			createExactServerManifest(
				{
					version: 1,
					components: []
				},
				{
					endpoints: {
						actions: {
							save: 1
						}
					} as any
				}
			)
		).toThrow('Malformed eXact endpoint routes');

		expect(() =>
			createExactServerManifest(
				{
					version: 1,
					components: []
				},
				{
					endpoints: {
						boundaries: ['remote']
					} as any
				}
			)
		).toThrow('Malformed eXact endpoint routes');
	});

	it('creates runtime allowlists from compiler manifests', () => {
		const manifest = createExactServerManifest(
			{
				version: 1,
				serverActions: {
					serverTask: {
						id: 'serverTask',
						componentId: 'Page',
						taskId: 'task-1',
						placement: 'server',
						stateContract: {
							reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
							writes: [{ path: 'project.title', kind: 'write', confidence: 'exact' }]
						}
					},
					sharedTask: {
						id: 'sharedTask',
						componentId: 'Page',
						taskId: 'task-2',
						placement: 'isomorphic'
					},
					clientTask: {
						id: 'clientTask',
						componentId: 'Widget',
						taskId: 'task-3',
						placement: 'client'
					}
				},
				components: [
					{ id: 'Page', placement: 'server' },
					{ id: 'Widget', placement: 'client' }
				],
				boundaries: [
					{
						id: 'client-widget-boundary',
						name: 'Widget',
						componentId: 'Widget',
						ownerComponentId: 'Page',
						kind: 'client-island'
					},
					{
						id: 'client-widget-boundary:children',
						name: 'Widget:children',
						componentId: 'Widget',
						ownerComponentId: 'Page',
						kind: 'server-slot'
					}
				]
			},
			{
				endpoint: '/__exact',
				endpoints: {
					actions: {
						sharedTask: 'https://remote.test/__exact'
					},
					boundaries: {
						'client-widget-boundary': 'https://remote.test/__exact'
					}
				}
			}
		);

		expect(manifest).toEqual({
			version: 1,
			endpoint: '/__exact',
			endpoints: {
				actions: {
					sharedTask: 'https://remote.test/__exact'
				},
				boundaries: {
					'client-widget-boundary': 'https://remote.test/__exact'
				}
			},
			actions: {
				serverTask: {
					id: 'serverTask',
					componentId: 'Page',
					taskId: 'task-1',
					placement: 'server',
					stateContract: {
						reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
						writes: [{ path: 'project.title', kind: 'write', confidence: 'exact' }]
					}
				},
				sharedTask: {
					id: 'sharedTask',
					componentId: 'Page',
					taskId: 'task-2',
					placement: 'isomorphic'
				}
			},
			boundaries: {
				'client-widget-boundary': {
					id: 'client-widget-boundary',
					name: 'Widget',
					componentId: 'Widget',
					ownerComponentId: 'Page',
					kind: 'client-island'
				},
				'client-widget-boundary:children': {
					id: 'client-widget-boundary:children',
					name: 'Widget:children',
					componentId: 'Widget',
					ownerComponentId: 'Page',
					kind: 'server-slot'
				},
				Page: { id: 'Page', componentId: 'Page' }
			},
			actionBoundaries: {
				serverTask: ['Page', 'client-widget-boundary', 'client-widget-boundary:children'],
				sharedTask: ['Page', 'client-widget-boundary', 'client-widget-boundary:children']
			}
		});

		expect(createExactHydrationStateContracts(manifest)).toEqual({
			serverTask: {
				reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
				writes: [{ path: 'project.title', kind: 'write', confidence: 'exact' }]
			}
		});
		expect(createExactHydrationActionBoundaries(manifest)).toEqual({
			serverTask: ['Page', 'client-widget-boundary', 'client-widget-boundary:children'],
			sharedTask: ['Page', 'client-widget-boundary', 'client-widget-boundary:children']
		});
		expect(createExactHydrationManifestConfig(manifest, { project: { id: 'p1' } })).toEqual({
			endpoint: '/__exact',
			endpoints: {
				actions: {
					sharedTask: 'https://remote.test/__exact'
				},
				boundaries: {
					'client-widget-boundary': 'https://remote.test/__exact'
				}
			},
			state: { project: { id: 'p1' } },
			stateContracts: {
				serverTask: {
					reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
					writes: [{ path: 'project.title', kind: 'write', confidence: 'exact' }]
				}
			},
			actionBoundaries: {
				serverTask: ['Page', 'client-widget-boundary', 'client-widget-boundary:children'],
				sharedTask: ['Page', 'client-widget-boundary', 'client-widget-boundary:children']
			}
		});
	});

	it('omits empty endpoint route maps from hydration config', () => {
		const manifest = createExactServerManifest(
			{
				version: 1,
				components: [{ id: 'Page', placement: 'server' }]
			},
			{
				endpoint: '/__exact',
				endpoints: {
					actions: {},
					boundaries: {}
				}
			}
		);

		expect(manifest.endpoints).toBeUndefined();
		expect(createExactHydrationManifestConfig(manifest)).toEqual({
			endpoint: '/__exact'
		});
	});

	it('merges runtime allowlists from multiple compiler manifests', () => {
		const manifest = createExactServerManifest(
			[
				{
					version: 1,
					serverActions: {
						pageTask: {
							id: 'pageTask',
							componentId: 'Page',
							taskId: 'task-1',
							placement: 'server',
							contextContract: [{ token: 'AuthContext', kind: 'read', confidence: 'exact' }]
						}
					},
					components: [{ id: 'Page', placement: 'server' }],
					boundaries: [
						{ id: 'page-widget', name: 'Widget', componentId: 'Widget', kind: 'client-island' }
					]
				},
				{
					version: 1,
					serverActions: {
						panelTask: {
							id: 'panelTask',
							componentId: 'Panel',
							taskId: 'task-2',
							placement: 'isomorphic'
						},
						clientOnly: {
							id: 'clientOnly',
							componentId: 'ClientOnly',
							taskId: 'task-3',
							placement: 'client'
						}
					},
					components: [
						{ id: 'Panel', placement: 'isomorphic' },
						{ id: 'ClientOnly', placement: 'client' }
					]
				}
			],
			{
				boundaries: {
					'page-widget': { id: 'page-widget', name: 'AppWidgetOverride' }
				}
			}
		);

		expect(manifest.actions).toEqual({
			pageTask: {
				id: 'pageTask',
				componentId: 'Page',
				taskId: 'task-1',
				placement: 'server',
				contextContract: [{ token: 'AuthContext', kind: 'read', confidence: 'exact' }]
			},
			panelTask: {
				id: 'panelTask',
				componentId: 'Panel',
				taskId: 'task-2',
				placement: 'isomorphic'
			}
		});
		expect(manifest.boundaries).toEqual({
			'page-widget': { id: 'page-widget', name: 'AppWidgetOverride' },
			Page: { id: 'Page', componentId: 'Page' },
			Panel: { id: 'Panel', componentId: 'Panel' }
		});
		expect(manifest.actionBoundaries).toEqual({
			pageTask: ['Page'],
			panelTask: ['Panel']
		});
	});

	it('rejects conflicting action ids across compiler manifests', () => {
		expect(() =>
			createExactServerManifest([
				{
					version: 1,
					serverActions: {
						save: { id: 'save', componentId: 'Page', taskId: 'task-1', placement: 'server' }
					}
				},
				{
					version: 1,
					serverActions: {
						save: { id: 'save', componentId: 'Panel', taskId: 'task-2', placement: 'server' }
					}
				}
			])
		).toThrow('Conflicting eXact action id in compiler manifests: save');
	});

	it('rejects conflicting boundary ids across compiler manifests', () => {
		expect(() =>
			createExactServerManifest([
				{
					version: 1,
					boundaries: [{ id: 'shared-boundary', componentId: 'Page', kind: 'client-island' }]
				},
				{
					version: 1,
					boundaries: [{ id: 'shared-boundary', componentId: 'Panel', kind: 'client-island' }]
				}
			])
		).toThrow('Conflicting eXact boundary id in compiler manifests: shared-boundary');
	});

	it('keeps explicit app boundary overrides while rejecting accidental manifest collisions', () => {
		const manifest = createExactServerManifest(
			[
				{
					version: 1,
					boundaries: [{ id: 'remote-widget', componentId: 'Widget', kind: 'client-island' }]
				},
				{
					version: 1,
					boundaries: [{ id: 'remote-widget', componentId: 'OtherWidget', kind: 'client-island' }]
				}
			],
			{
				boundaries: {
					'remote-widget': { id: 'remote-widget', name: 'AppOwnedRemoteWidget' }
				}
			}
		);

		expect(manifest.boundaries?.['remote-widget']).toEqual({
			id: 'remote-widget',
			name: 'AppOwnedRemoteWidget'
		});
	});

	it('merges app-provided action allowlists with compiler manifests', () => {
		const manifest = createExactServerManifest(
			{
				version: 1,
				components: [{ id: 'Profile', placement: 'isomorphic' }],
				boundaries: [
					{
						id: 'profile-client',
						componentId: 'ClientWidget',
						ownerComponentId: 'Profile',
						kind: 'client-island'
					}
				]
			},
			{
				actions: {
					'save-profile': { id: 'save-profile', componentId: 'Profile', placement: 'server' }
				}
			}
		);

		expect(manifest.actions).toEqual({
			'save-profile': { id: 'save-profile', componentId: 'Profile', placement: 'server' }
		});
		expect(manifest.actionBoundaries).toEqual({
			'save-profile': ['Profile', 'profile-client']
		});
	});

	it('preserves compiler boundary render edge metadata', () => {
		const manifest = createExactServerManifest({
			version: 1,
			components: [{ id: 'Page', placement: 'server' }],
			boundaries: [
				{
					id: 'page-widget',
					name: 'Widget',
					componentId: 'Widget',
					ownerComponentId: 'Page',
					renderEdgeId: 'edge-1',
					renderEdgeIndex: 1,
					renderPath: '3.0.1',
					kind: 'client-island'
				}
			]
		});

		expect(manifest.boundaries?.['page-widget']).toEqual({
			id: 'page-widget',
			name: 'Widget',
			componentId: 'Widget',
			ownerComponentId: 'Page',
			renderEdgeId: 'edge-1',
			renderEdgeIndex: 1,
			renderPath: '3.0.1',
			kind: 'client-island'
		});
	});

	it('dispatches only manifest-allowlisted actions', async () => {
		const allowed = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'action', id: 'allowed-action', payload: { title: 'Ready' } }
			},
			context()
		);

		expect(allowed.status).toBe(200);
		expect(JSON.parse(allowed.body)).toMatchObject({
			ok: true,
			patches: [{ type: 'text', id: 'title', value: 'Ready' }]
		});

		const denied = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'action', id: '../server/private', payload: {} }
			},
			context()
		);

		expect(denied.status).toBe(404);
		expect(JSON.parse(denied.body)).toEqual({ error: 'not_found' });
	});

	it('accepts action boundary snapshots only for manifest-allowlisted boundaries', async () => {
		let received: unknown;
		const allowed = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					boundaryHtmls: {
						'allowed-boundary': '<p>Current</p>'
					}
				}
			},
			context({
				actions: {
					'allowed-action': (input) => {
						received = input.boundaryHtmls;
						return {};
					}
				}
			})
		);

		expect(allowed.status).toBe(200);
		expect(received).toEqual({
			'allowed-boundary': '<p>Current</p>'
		});

		const denied = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					boundaryHtmls: {
						'../private': '<p>Nope</p>'
					}
				}
			},
			context()
		);

		expect(denied.status).toBe(400);
		expect(JSON.parse(denied.body)).toEqual({ error: 'bad_request' });
	});

	it('does not dispatch allowlisted ids without registered server handlers', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'action', id: 'allowed-action' }
			},
			context({ actions: {} })
		);

		expect(result.status).toBe(404);
		expect(JSON.parse(result.body)).toEqual({ error: 'not_found' });
	});

	it('refreshes only manifest-allowlisted boundaries', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'refresh', id: 'allowed-boundary' }
			},
			context()
		);

		expect(result.status).toBe(200);
		expect(JSON.parse(result.body)).toMatchObject({
			ok: true,
			patches: [{ type: 'replace', id: 'allowed-boundary', html: '<section>Updated</section>' }]
		});
	});
});
