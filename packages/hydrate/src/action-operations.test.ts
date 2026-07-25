/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { createExactClient } from './index.js';

function continuation(
	id: string,
	options: {
		reads?: any[];
		writes?: any[];
		boundaries?: string[];
		publicContexts?: string[];
	} = {}
) {
	return {
		id,
		componentId: `test:${id}`,
		stateReads: options.reads ?? [],
		stateWrites: options.writes ?? [],
		publicContexts: options.publicContexts ?? [],
		serverContexts: [],
		boundaries: options.boundaries ?? []
	};
}

describe('@exactjs/hydrate action-operations', () => {
	it('uses continuation descriptors for minimal activation records', async () => {
		const container = document.createElement('main');
		container.innerHTML = '<!--exact:profile--><p>Ada</p><!--/exact:profile-->';
		let requestBody: any;
		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: {
				project: { id: 'p1', privateNote: 'hidden' },
				unrelated: true
			},
			continuations: {
				save: {
					id: 'save',
					stateReads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
					stateWrites: [],
					publicContexts: ['PublicConfig'],
					serverContexts: [],
					boundaries: ['profile']
				}
			},
			publicContexts: {
				PublicConfig: { appDomain: 'https://example.test' },
				UnusedConfig: { value: 'not transported' }
			},
			fetch: async (_input, init) => {
				requestBody = JSON.parse(init.body);
				return {
					ok: true,
					status: 200,
					async json() {
						return { ok: true, type: 'action', id: 'save' };
					}
				};
			}
		});

		await client.invokeAction('save');

		expect(requestBody).toEqual({
			type: 'action',
			root: 'page',
			id: 'save',
			state: { project: { id: 'p1' } },
			publicContext: {
				PublicConfig: { appDomain: 'https://example.test' }
			},
			boundaryHtmls: {
				profile: '<p>Ada</p>'
			}
		});
	});

	it('merges only compiler-declared continuation state writes', async () => {
		const container = document.createElement('main');
		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: {
				profile: { name: 'Before', role: 'admin' },
				unchanged: true
			},
			continuations: {
				save: {
					id: 'save',
					stateReads: [],
					stateWrites: [{ path: 'profile.name', kind: 'write', confidence: 'exact' }],
					publicContexts: [],
					serverContexts: [],
					boundaries: []
				}
			},
			fetch: async () => ({
				ok: true,
				status: 200,
				async json() {
					return {
						ok: true,
						type: 'action',
						id: 'save',
						state: { profile: { name: 'After' } }
					};
				}
			})
		});

		await client.invokeAction('save');

		expect(client.state).toEqual({
			profile: { name: 'After', role: 'admin' },
			unchanged: true
		});
	});

	it('atomically rejects continuation effects outside the generated response contract', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<!--exact:allowed--><span data-exact-id="allowed-text">Before</span><!--/exact:allowed-->' +
			'<!--exact:other--><span data-exact-id="other-text">Private</span><!--/exact:other-->';
		const diagnostics: string[] = [];
		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: { profile: { name: 'Before' } },
			continuations: {
				save: {
					id: 'save',
					stateReads: [],
					stateWrites: [{ path: 'profile.name', kind: 'write', confidence: 'exact' }],
					publicContexts: [],
					serverContexts: [],
					boundaries: ['allowed']
				}
			},
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
			fetch: async () => ({
				ok: true,
				status: 200,
				async json() {
					return {
						ok: true,
						type: 'action',
						id: 'save',
						state: {
							profile: { name: 'After' },
							privateToken: 'must not cross'
						},
						patches: [{ type: 'text', id: 'other-text', value: 'Leaked' }]
					};
				}
			})
		});

		await client.invokeAction('save');

		expect(client.state).toEqual({ profile: { name: 'Before' } });
		expect(container.querySelector('[data-exact-id="other-text"]')?.textContent).toBe('Private');
		expect(diagnostics).toEqual(['invalid-response']);
	});

	it('sends configured action boundary snapshots with action invocations', async () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<!--exact:profile--><p>Ada</p><!--/exact:profile--><span data-exact-server-slot="profile:children"><em>Child</em></span>';
		let requestBody: any;
		const client = createExactClient(container, {
			endpoint: '/__exact',
			continuations: {
				save: continuation('save', {
					boundaries: ['profile', 'profile:children', 'missing']
				})
			},
			fetch: async (_input, init) => {
				requestBody = JSON.parse(init.body);
				return {
					ok: true,
					status: 200,
					async json() {
						return { ok: true, type: 'action', id: 'save' };
					}
				};
			}
		});

		await client.invokeAction('save');

		expect(requestBody.boundaryHtmls).toEqual({
			profile: '<p>Ada</p>',
			'profile:children': '<em>Child</em>'
		});
	});

	it('compares idempotent continuation contracts independent of object key order', () => {
		const container = document.createElement('div');
		const client = createExactClient(container, { endpoint: '/__exact' });
		client.registerComponents({
			continuations: {
				save: continuation('save', {
					reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }]
				})
			}
		});

		expect(() =>
			client.registerComponents({
				continuations: {
					save: continuation('save', {
						reads: [{ confidence: 'exact', kind: 'read', path: 'project.id' }]
					})
				}
			})
		).not.toThrow();
	});

	it('applies only current boundaries from a partially stale action response', async () => {
		const container = document.createElement('div');
		container.innerHTML = [
			'<!--exact:left--><span data-exact-id="left-value">Left old</span><!--/exact:left-->',
			'<!--exact:right--><span data-exact-id="right-value">Right old</span><!--/exact:right-->'
		].join('');
		type Response = { ok: true; status: 200; json(): Promise<unknown> };
		let resolveAction!: (response: Response) => void;
		let resolveRefresh!: (response: Response) => void;
		const fetch = async (_input: string, init: { body: string }) => {
			const request = JSON.parse(init.body) as { type: string };
			return await new Promise<Response>((resolve) => {
				if (request.type === 'action') resolveAction = resolve;
				else resolveRefresh = resolve;
			});
		};
		const diagnostics: string[] = [];
		const operations: Array<{
			id: string;
			stale: boolean;
			patchesApplied: boolean;
			patchIds: string[];
		}> = [];
		const client = createExactClient(container, {
			endpoint: '/__exact',
			batch: false,
			fetch,
			state: { version: 0 },
			continuations: {
				save: continuation('save', {
					writes: [{ path: 'version', kind: 'write', confidence: 'exact' }],
					boundaries: ['left', 'left', 'right']
				})
			},
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.message),
			onOperation: (observation) =>
				operations.push({
					id: observation.operation.id,
					stale: observation.stale,
					patchesApplied: observation.patchesApplied,
					patchIds: observation.appliedPatches.map((patch) => patch.id)
				})
		});

		const action = client.invokeAction('save');
		const refresh = client.refreshBoundary('left');
		await Promise.resolve();
		resolveRefresh({
			ok: true,
			status: 200,
			async json() {
				return {
					ok: true,
					type: 'refresh',
					id: 'left',
					patches: [{ type: 'text', id: 'left-value', value: 'Left newest' }],
					state: { version: 2 }
				};
			}
		});
		await refresh;
		resolveAction({
			ok: true,
			status: 200,
			async json() {
				return {
					ok: true,
					type: 'action',
					id: 'save',
					patches: [
						{ type: 'text', id: 'left-value', value: 'Left stale' },
						{ type: 'text', id: 'right-value', value: 'Right saved' }
					],
					state: { version: 1 }
				};
			}
		});
		await action;

		expect(container.querySelector('[data-exact-id=left-value]')?.textContent).toBe('Left newest');
		expect(container.querySelector('[data-exact-id=right-value]')?.textContent).toBe('Right saved');
		expect(client.state).toEqual({ version: 2 });
		expect(diagnostics).toEqual([
			'partially ignored stale exact action response for save (text:left-value)'
		]);
		expect(operations).toContainEqual({
			id: 'save',
			stale: true,
			patchesApplied: true,
			patchIds: ['right-value']
		});
	});

	it('sends current boundary html with refresh requests', async () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:panel--><p class="old">Loading</p><!--/exact:panel-->';
		const requests: unknown[] = [];
		const fetch = async (_input: string, init: { body: string }) => {
			requests.push(JSON.parse(init.body));
			return {
				ok: true,
				status: 200,
				async json() {
					return { ok: true, type: 'refresh', id: 'panel', patches: [] };
				}
			};
		};

		const client = createExactClient(container, {
			endpoint: '/__exact',
			fetch
		});
		await client.refreshBoundary('panel');

		expect(requests).toEqual([
			{
				type: 'refresh',
				root: 'page',
				id: 'panel',
				boundaryHtml: '<p class="old">Loading</p>'
			}
		]);
	});

	it('sends only exact state contract reads for actions when available', async () => {
		const container = document.createElement('div');
		const requests: unknown[] = [];
		const fetch = async (_input: string, init: { body: string }) => {
			requests.push(JSON.parse(init.body));
			return {
				ok: true,
				status: 200,
				async json() {
					return { ok: true, type: 'action', id: 'save-project' };
				}
			};
		};

		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: {
				project: { id: 'p1', title: 'Hidden' },
				user: { id: 'u1' }
			},
			continuations: {
				'save-project': continuation('save-project', {
					reads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }]
				})
			},
			fetch
		});

		await client.invokeAction('save-project');

		expect(requests).toEqual([
			{
				type: 'action',
				root: 'page',
				id: 'save-project',
				state: { project: { id: 'p1' } }
			}
		]);
	});

	it('sends exact state contract reads through array paths', async () => {
		const container = document.createElement('div');
		const requests: unknown[] = [];
		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: {
				projects: [
					{ id: 'p1', secret: 'hidden' },
					{ id: 'p2', secret: 'hidden' }
				]
			},
			continuations: {
				'save-project': continuation('save-project', {
					reads: [{ path: 'projects.1.id', kind: 'read', confidence: 'exact' }]
				})
			},
			fetch: async (_input, init) => {
				requests.push(JSON.parse(init.body));
				return {
					ok: true,
					status: 200,
					async json() {
						return { ok: true, type: 'action', id: 'save-project' };
					}
				};
			}
		});

		await client.invokeAction('save-project');

		expect(requests).toEqual([
			{
				type: 'action',
				root: 'page',
				id: 'save-project',
				state: { projects: [null, { id: 'p2' }] }
			}
		]);
	});

	it('ignores unsafe object keys in exact state contract paths', async () => {
		const container = document.createElement('div');
		const requests: unknown[] = [];
		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: JSON.parse('{"project":{"id":"p1"},"__proto__":{"polluted":true}}'),
			continuations: {
				'save-project': continuation('save-project', {
					reads: [
						{ path: 'project.id', kind: 'read', confidence: 'exact' },
						{ path: '__proto__.polluted', kind: 'read', confidence: 'exact' }
					]
				})
			},
			fetch: async (_input, init) => {
				requests.push(JSON.parse(init.body));
				return {
					ok: true,
					status: 200,
					async json() {
						return { ok: true, type: 'action', id: 'save-project' };
					}
				};
			}
		});

		await client.invokeAction('save-project');

		expect(requests).toEqual([
			{
				type: 'action',
				root: 'page',
				id: 'save-project',
				state: { project: { id: 'p1' } }
			}
		]);
		expect(({} as any).polluted).toBeUndefined();
	});
});
