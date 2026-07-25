import { describe, expect, it, vi } from 'vitest';
import { createExactServerManifest, handleExactRequest } from './index.js';
import { context } from './test-support/server.js';

describe('@exactjs/server actions', () => {
	it('accepts equivalent action contracts independent of object key order', () => {
		const base = {
			id: 'save',
			componentId: 'Page',
			taskId: 'task-1',
			placement: 'server' as const,
			stateContract: {
				reads: [{ path: 'project.id', kind: 'read' as const, confidence: 'exact' as const }]
			}
		};
		expect(() =>
			createExactServerManifest([
				{ version: 1, serverActions: { save: base } },
				{
					version: 1,
					serverActions: {
						save: {
							placement: 'server',
							taskId: 'task-1',
							componentId: 'Page',
							id: 'save',
							stateContract: { reads: [{ confidence: 'exact', kind: 'read', path: 'project.id' }] }
						}
					}
				}
			])
		).not.toThrow();
	});

	it('rejects action boundary snapshots outside the action boundary contract', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					boundaryHtmls: {
						'other-boundary': '<p>Other</p>'
					}
				}
			},
			context({
				manifest: {
					version: 1,
					actions: {
						'allowed-action': { id: 'allowed-action', placement: 'server' }
					},
					boundaries: {
						'allowed-boundary': { id: 'allowed-boundary' },
						'other-boundary': { id: 'other-boundary' }
					},
					actionBoundaries: {
						'allowed-action': ['allowed-boundary']
					}
				}
			})
		);

		expect(result.status).toBe(400);
		expect(JSON.parse(result.body)).toEqual({ error: 'bad_request' });
	});

	it('rejects action requests missing exact state contract reads', async () => {
		const withState = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					payload: { title: 'Ready' },
					state: { project: { id: 'p1' } }
				}
			},
			context({
				manifest: {
					version: 1,
					actions: {
						'allowed-action': {
							id: 'allowed-action',
							placement: 'server',
							stateContract: {
								reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }]
							}
						}
					}
				}
			})
		);
		expect(withState.status).toBe(200);

		const missingState = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'action', id: 'allowed-action', state: { project: {} } }
			},
			context({
				manifest: {
					version: 1,
					actions: {
						'allowed-action': {
							id: 'allowed-action',
							placement: 'server',
							stateContract: {
								reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }]
							}
						}
					}
				}
			})
		);

		expect(missingState.status).toBe(400);
		expect(JSON.parse(missingState.body)).toEqual({ error: 'bad_request' });
	});

	it('accepts exact state contract reads through array paths', async () => {
		const withState = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					payload: { title: 'Ready' },
					state: { projects: [{ id: 'p1' }] }
				}
			},
			context({
				manifest: {
					version: 1,
					actions: {
						'allowed-action': {
							id: 'allowed-action',
							placement: 'server',
							stateContract: {
								reads: [{ path: 'projects.0.id', kind: 'read', confidence: 'exact' }]
							}
						}
					}
				}
			})
		);
		expect(withState.status).toBe(200);

		const missingState = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					payload: { title: 'Ready' },
					state: { projects: [] }
				}
			},
			context({
				manifest: {
					version: 1,
					actions: {
						'allowed-action': {
							id: 'allowed-action',
							placement: 'server',
							stateContract: {
								reads: [{ path: 'projects.0.id', kind: 'read', confidence: 'exact' }]
							}
						}
					}
				}
			})
		);
		expect(missingState.status).toBe(400);
	});

	it('keeps server context resolution out of the client request contract', async () => {
		const action = vi.fn(() => ({ state: { ready: true } }));
		const exactContext = context({
			manifest: {
				version: 1,
				actions: {
					'allowed-action': {
						id: 'allowed-action',
						placement: 'server',
						serverContextContract: [
							{ token: 'AuthContext', kind: 'read', confidence: 'exact' },
							{ token: 'ThemeContext', kind: 'write', confidence: 'exact' }
						]
					}
				}
			},
			actions: {
				'allowed-action': action
			}
		});

		const accepted = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action'
				}
			},
			exactContext
		);

		expect(accepted.status).toBe(200);
		expect(JSON.parse(accepted.body)).toMatchObject({
			ok: true,
			state: { ready: true }
		});
		expect(action).toHaveBeenCalledOnce();

		const submitted = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					publicContext: {
						AuthContext: { id: 'u1' }
					}
				}
			},
			exactContext
		);
		expect(submitted.status).toBe(400);
		expect(JSON.parse(submitted.body)).toEqual({ error: 'bad_request' });
		expect(action).toHaveBeenCalledOnce();
	});

	it('accepts only compiler-contracted public context projections', async () => {
		const action = vi.fn((input) => ({
			state: { domain: input.publicContext?.PublicConfig }
		}));
		const exactContext = context({
			manifest: {
				version: 1,
				actions: {
					'public-action': {
						id: 'public-action',
						placement: 'server',
						publicContextContract: [{ token: 'PublicConfig', kind: 'read', confidence: 'exact' }]
					}
				}
			},
			actions: { 'public-action': action }
		});

		const accepted = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'public-action',
					publicContext: { PublicConfig: { domain: 'https://example.test' } }
				}
			},
			exactContext
		);
		expect(accepted.status).toBe(200);
		expect(JSON.parse(accepted.body)).toMatchObject({
			state: { domain: { domain: 'https://example.test' } }
		});

		const rejected = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'public-action',
					publicContext: { SecretContext: 'nope' }
				}
			},
			exactContext
		);
		expect(rejected.status).toBe(400);
		expect(action).toHaveBeenCalledOnce();
	});

	it('rejects public context when no action contract allows it', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					publicContext: {
						AuthContext: { id: 'u1' }
					}
				}
			},
			context()
		);

		expect(result.status).toBe(400);
		expect(JSON.parse(result.body)).toEqual({ error: 'bad_request' });
	});

	it('rejects malformed single boundary snapshots', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'refresh',
					id: 'allowed-boundary',
					boundaryHtml: { html: '<p>Previous</p>' }
				}
			},
			context()
		);

		expect(result.status).toBe(400);
		expect(JSON.parse(result.body)).toEqual({ error: 'bad_request' });
	});
});
