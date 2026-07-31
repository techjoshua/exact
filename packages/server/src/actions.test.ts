import { describe, expect, it, vi } from 'vitest';
import {
	defineExactOperationContract,
	defineExactBoundaryContract,
	handleExactRequest
} from './index.js';
import { context } from './test-support/server.js';

describe('@exactjs/server actions', () => {
	it('rejects action boundary snapshots outside the composed contract', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'save',
					boundaryHtmls: { other: '<p>Other</p>' }
				}
			},
			context({
				contract: {
					version: 1,
					actions: {
						save: defineExactOperationContract('save', { boundaries: ['allowed'] })
					},
					boundaries: {
						allowed: defineExactBoundaryContract('allowed'),
						other: defineExactBoundaryContract('other')
					}
				},
				actions: { save: () => ({}) }
			})
		);

		expect(result.status).toBe(400);
		expect(JSON.parse(result.body)).toEqual({ error: 'bad_request' });
	});

	it('requires every exact state read and supports array paths', async () => {
		const exactContext = context({
			contract: {
				version: 1,
				actions: {
					save: defineExactOperationContract('save', {
						reads: [{ path: 'projects.0.id', kind: 'read', confidence: 'exact' }]
					})
				},
				boundaries: {}
			},
			actions: { save: () => ({}) }
		});
		const accepted = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'action', id: 'save', state: { projects: [{ id: 'p1' }] } }
			},
			exactContext
		);
		const rejected = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'action', id: 'save', state: { projects: [] } }
			},
			exactContext
		);

		expect(accepted.status).toBe(200);
		expect(rejected.status).toBe(400);
	});

	it('keeps server context resolution out of the client request', async () => {
		const action = vi.fn(() => ({ state: { ready: true } }));
		const exactContext = context({
			contract: {
				version: 1,
				actions: {
					save: defineExactOperationContract('save', {
						writes: [{ path: 'ready', kind: 'write', confidence: 'exact' }],
						serverContexts: ['AuthContext']
					})
				},
				boundaries: {}
			},
			actions: { save: action }
		});
		const accepted = await handleExactRequest(
			{ method: 'POST', body: { type: 'action', id: 'save' } },
			exactContext
		);
		const submitted = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'save',
					publicContext: { AuthContext: { id: 'u1' } }
				}
			},
			exactContext
		);

		expect(accepted.status).toBe(200);
		expect(submitted.status).toBe(400);
		expect(action).toHaveBeenCalledOnce();
	});

	it('accepts only compiler-contracted public context projections', async () => {
		const action = vi.fn((input) => ({
			state: { domain: input.publicContext?.PublicConfig }
		}));
		const exactContext = context({
			contract: {
				version: 1,
				actions: {
					save: defineExactOperationContract('save', {
						writes: [{ path: 'domain', kind: 'write', confidence: 'exact' }],
						publicContexts: ['PublicConfig']
					})
				},
				boundaries: {}
			},
			actions: { save: action }
		});
		const accepted = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'save',
					publicContext: { PublicConfig: { domain: 'https://example.test' } }
				}
			},
			exactContext
		);
		const rejected = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'action',
					id: 'save',
					publicContext: { SecretContext: 'nope' }
				}
			},
			exactContext
		);

		expect(accepted.status).toBe(200);
		expect(rejected.status).toBe(400);
		expect(action).toHaveBeenCalledOnce();
	});

	it('rejects state outside the compiler-declared response write contract', async () => {
		const result = await handleExactRequest(
			{ method: 'POST', body: { type: 'action', id: 'save' } },
			context({
				contract: {
					version: 1,
					actions: {
						save: defineExactOperationContract('save', {
							writes: [{ path: 'profile.name', kind: 'write', confidence: 'exact' }]
						})
					},
					boundaries: {}
				},
				actions: {
					save: () => ({
						state: {
							profile: { name: 'Ada' },
							privateToken: 'must not cross'
						}
					})
				}
			})
		);

		expect(result.status).toBe(500);
		expect(JSON.parse(result.body)).toEqual({ error: 'internal_error' });
	});

	it('rejects malformed boundary snapshots before dispatch', async () => {
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
