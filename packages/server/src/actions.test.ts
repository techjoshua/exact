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

	it('validates serialized context against action context contracts', async () => {
		const action = vi.fn((input) => ({
			state: { user: (input.context as Record<string, unknown>).AuthContext }
		}));
		const exactContext = context({
			manifest: {
				version: 1,
				actions: {
					'allowed-action': {
						id: 'allowed-action',
						placement: 'server',
						contextContract: [
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
					id: 'allowed-action',
					context: {
						AuthContext: { id: 'u1' },
						ThemeContext: 'dark'
					}
				}
			},
			exactContext
		);

		expect(accepted.status).toBe(200);
		expect(JSON.parse(accepted.body)).toMatchObject({
			ok: true,
			state: { user: { id: 'u1' } }
		});
		expect(action).toHaveBeenCalledOnce();

		const missing = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					context: {
						ThemeContext: 'dark'
					}
				}
			},
			exactContext
		);
		expect(missing.status).toBe(400);
		expect(JSON.parse(missing.body)).toEqual({ error: 'bad_request' });

		const unknown = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					context: {
						AuthContext: { id: 'u1' },
						SecretContext: 'nope'
					}
				}
			},
			exactContext
		);
		expect(unknown.status).toBe(400);
		expect(JSON.parse(unknown.body)).toEqual({ error: 'bad_request' });
	});

	it('rejects serialized context when no action context contract allows it', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'allowed-action',
					context: {
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
