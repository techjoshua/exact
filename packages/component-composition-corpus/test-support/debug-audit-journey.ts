import type { ExactServerContext, ExactRequestLike } from '../../server/src/types.js';

type Api = Pick<
	typeof import('../../server/src/index.js'),
	'handleExactRequest' | 'createExactServerDebugRuntime' | 'exactResponseToFetchResponse'
>;
type Mode =
	| 'session'
	| 'runtime'
	| 'abort'
	| 'expiry'
	| 'throw'
	| 'async'
	| 'pending'
	| 'resolved'
	| 'value'
	| 'thenable'
	| 'throwing-then';

/** Fences audit callback retirement and observes asynchronous notifications without changing live query results. */
export async function verifyDebugAuditLifetime(
	api: Api,
	mode: Mode,
	advanceClock?: () => void
): Promise<void> {
	const owner = new AbortController();
	let sessionId = '';
	let notifications = 0;
	let observations = 0;
	let retire = true;
	const context: ExactServerContext = {
		contract: { version: 1, invocations: {}, boundaries: {} },
		allowDebug: true,
		publicOrigin: 'http://localhost',
		inspectionQueryService: {
			async request(query) {
				return {
					protocol: 1,
					id: query.id,
					ok: true,
					identity: { sessionId },
					result: 'audit-owned-state'
				};
			},
			subscribe() {
				return { closed: true, close() {} };
			}
		},
		onDebugAudit() {
			observations++;
			if (!retire) return;
			if (mode === 'runtime') void context.debugRuntime!.close();
			else if (mode === 'session')
				void context.debugRuntime!.handle(
					request({ type: 'debug', version: 1, request: 'close', sessionId }),
					{ type: 'debug', version: 1, request: 'close', sessionId }
				);
			else if (mode === 'abort') owner.abort(null);
			else if (mode === 'expiry') {
				if (!advanceClock) throw new Error('Expiry audit needs an owned clock');
				advanceClock();
			} else if (mode === 'throw') throw new Error('private audit failure');
			else if (mode === 'async') return Promise.reject(new Error('private async audit failure'));
			else if (mode === 'pending') return new Promise<void>(() => {});
			else if (mode === 'resolved') return Promise.resolve();
			else if (mode === 'value') return 42;
			else if (mode === 'thenable')
				return {
					then(_resolve: unknown, reject: (error: unknown) => void) {
						notifications++;
						reject(new Error('private thenable audit failure'));
					}
				};
			else
				return Object.defineProperty({}, 'then', {
					get() {
						notifications++;
						throw new Error('private then getter failure');
					}
				});
		}
	};
	const request = (body: unknown, signal?: AbortSignal): ExactRequestLike => ({
		method: 'POST',
		url: '/__exact',
		headers: { origin: 'http://localhost' },
		body,
		...(signal ? { signal } : {})
	});
	context.debugRuntime = api.createExactServerDebugRuntime(context);
	const open = async () => {
		const response = await api.handleExactRequest(
			request({ type: 'debug', version: 1, request: 'open', capabilities: ['snapshot'] }),
			context
		);
		sessionId = (await api.exactResponseToFetchResponse(response).json()).session.id;
	};
	const query = () =>
		api.handleExactRequest(
			request(
				{
					type: 'debug',
					version: 1,
					request: 'query',
					sessionId,
					query: { protocol: 1, id: 'audit', method: 'components.tree' }
				},
				retire ? owner.signal : undefined
			),
			context
		);
	try {
		await open();
		const first = await query();
		const retired = ['session', 'runtime', 'abort', 'expiry'].includes(mode);
		const body = await api.exactResponseToFetchResponse(first).text();
		if (
			first.status !== (retired ? 404 : 200) ||
			(retired && body.includes('audit-owned-state')) ||
			body.includes('private audit failure')
		)
			throw new Error(`Audit ${mode} lost query publication ownership or notification isolation`);
		if (mode === 'thenable' || mode === 'throwing-then') {
			await Promise.resolve();
			if (notifications !== 1) throw new Error('Audit notification settlement was not observed');
		}
		retire = false;
		if (mode === 'runtime') context.debugRuntime = api.createExactServerDebugRuntime(context);
		if (retired) await open();
		const next = await query();
		if (
			next.status !== 200 ||
			observations !== 2 ||
			!(await api.exactResponseToFetchResponse(next).text()).includes('audit-owned-state')
		)
			throw new Error('Audit settlement prevented the next live query');
	} finally {
		owner.abort();
		await context.debugRuntime.close();
	}
}
