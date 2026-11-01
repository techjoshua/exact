import type { HydrateOptions } from '@exactjs/hydrate';

type StateClientOptions = Pick<
	HydrateOptions,
	'endpoint' | 'state' | 'continuations' | 'fetch' | 'onDiagnostic'
>;
type StateClientApi = {
	createExactClient(
		root: Element,
		options: StateClientOptions
	): {
		readonly state?: unknown;
		invokeTask(id: string): Promise<unknown>;
		dispose(): void;
	};
};

/** Checks every failed response stage fences all state publication and allows subsequent progress. */
export async function verifyContinuationStateResponses(
	api: StateClientApi,
	document: Document
): Promise<void> {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('Continuation state response: ' + message);
	};
	for (const mode of [
		'bad-state',
		'bad-mutations',
		'bad-deletions',
		'both',
		'mutations',
		'state',
		'deletion'
	]) {
		const diagnostics: string[] = [];
		let calls = 0;
		const client = api.createExactClient(document.createElement('div'), {
			endpoint: '/__exact',
			state: { value: 'before', lookup: new Map([['before', 1]]) },
			continuations: {
				mixed: {
					id: 'mixed',
					componentId: 'test:mixed',
					kind: 'task',
					readiness: 'nonblocking',
					dependencies: [],
					stateReads: [],
					stateWrites: [
						{ path: 'value', kind: 'write', confidence: 'exact' },
						{ path: 'lookup', kind: 'write', confidence: 'exact', operation: 'map' }
					],
					publicContexts: [],
					serverContexts: [],
					contextWrites: [],
					boundaries: []
				}
			},
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
			fetch: async () => {
				const first = calls++ === 0;
				return {
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							type: 'invoke',
							id: 'mixed',
							...(first && (mode === 'mutations' || mode === 'deletion')
								? {}
								: {
										state:
											first && mode === 'bad-state'
												? { value: 'after', forbidden: 'bad' }
												: { value: 'after' }
									}),
							...(first && (mode === 'deletion' || mode === 'bad-deletions')
								? { deletions: [mode === 'deletion' ? 'value' : 'forbidden'] }
								: {}),
							...(first && mode === 'state'
								? {}
								: {
										mutations: [
											{
												path: first && mode === 'bad-mutations' ? 'forbidden' : 'lookup',
												operation: 'map-set',
												key: 'after',
												value: 2
											}
										]
									})
						};
					}
				};
			}
		});
		try {
			await client.invokeTask('mixed');
			const state = client.state as { value: string; lookup: Map<string, number> };
			const rejected = mode.startsWith('bad-');
			check(
				mode === 'deletion'
					? !Object.hasOwn(state, 'value')
					: state.value === (rejected || mode === 'mutations' ? 'before' : 'after'),
				mode + ' scalar publication'
			);
			check(
				state.lookup.has('after') === (!rejected && mode !== 'state'),
				mode + ' collection publication'
			);
			check(
				diagnostics.length === (rejected ? 1 : 0) &&
					(!rejected || diagnostics[0] === 'invalid-response'),
				mode + ' diagnostic'
			);
			await client.invokeTask('mixed');
			const next = client.state as typeof state;
			check(next.value === 'after' && next.lookup.get('after') === 2, mode + ' next invocation');
		} finally {
			client.dispose();
		}
	}
	const rows = new Array<{ lookup: Map<string, number> }>(3);
	rows[2] = { lookup: new Map([['before', 1]]) };
	const sparse = api.createExactClient(document.createElement('div'), {
		endpoint: '/__exact',
		state: { rows },
		continuations: {
			sparse: {
				id: 'sparse',
				componentId: 'test:sparse',
				kind: 'task',
				readiness: 'nonblocking',
				dependencies: [],
				stateReads: [],
				stateWrites: [
					{ path: 'rows.2.lookup', kind: 'write', confidence: 'exact', operation: 'map' }
				],
				publicContexts: [],
				serverContexts: [],
				contextWrites: [],
				boundaries: []
			}
		},
		fetch: async () => ({
			ok: true,
			status: 200,
			async json() {
				return {
					ok: true,
					type: 'invoke',
					id: 'sparse',
					mutations: [{ path: 'rows.2.lookup', operation: 'map-set', key: 'after', value: 2 }]
				};
			}
		})
	});
	try {
		await sparse.invokeTask('sparse');
		const result = sparse.state as { rows: typeof rows };
		check(Object.keys(result.rows).join(',') === '2', 'sparse untouched slots stay absent');
		check(
			result.rows[2]!.lookup.get('after') === 2 && !rows[2]!.lookup.has('after'),
			'sparse collection merge is immutable'
		);
	} finally {
		sparse.dispose();
	}
}
