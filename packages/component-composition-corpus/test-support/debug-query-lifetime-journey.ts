import type { ExactRequestLike, ExactServerContext } from '../../server/src/types.js';
import type { ExactInspectionResponse } from '@exactjs/devtools-protocol';

type Api = Pick<
	typeof import('../../server/src/index.js'),
	'handleExactRequest' | 'createExactServerDebugRuntime' | 'exactResponseToFetchResponse'
>;
type Retirement = 'session' | 'runtime' | 'abort' | 'pre-abort' | 'expiry';

/** Fences delayed inspection publication and auditing while retaining valid local and forwarded sessions. */
export async function verifyDebugQueryLifetime(
	api: Api,
	retirement: Retirement,
	advanceClock?: () => void
): Promise<void> {
	for (const forwarded of retirement === 'session' ? [false] : [false, true]) {
		for (const reject of retirement === 'pre-abort' ? [false] : [false, true]) {
			let begin!: () => void;
			const started = new Promise<void>((resolve) => {
				begin = resolve;
			});
			let complete!: (value: ExactInspectionResponse) => void;
			let fail!: (reason: unknown) => void;
			const pending = new Promise<ExactInspectionResponse>((resolve, reject) => {
				complete = resolve;
				fail = reject;
			});
			let live = false;
			let queries = 0;
			let sessionId = 'forwarded-session';
			const audits: unknown[] = [];
			const context: ExactServerContext = {
				contract: { version: 1, invocations: {}, boundaries: {} },
				allowDebug: true,
				publicOrigin: 'http://localhost',
				onDebugAudit: (event) => {
					audits.push(event);
				},
				inspectionQueryService: {
					request(request) {
						queries++;
						begin();
						return live
							? Promise.resolve({
									protocol: 1,
									id: request.id,
									ok: true,
									identity: { sessionId },
									result: 'live-state'
								})
							: pending;
					},
					subscribe() {
						return { closed: true, close() {} };
					}
				}
			};
			context.debugRuntime = api.createExactServerDebugRuntime(context);
			const owner = new AbortController();
			const request = (body: unknown, extra: Partial<ExactRequestLike> = {}): ExactRequestLike => ({
				method: 'POST',
				url: '/__exact',
				headers: { origin: 'http://localhost' },
				body,
				...extra
			});
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
							query: { protocol: 1, id: 'pending', method: 'components.tree' }
						},
						{
							signal: owner.signal,
							...(forwarded
								? {
										headers: {
											origin: 'http://localhost',
											'x-exact-debug-binding': 'remote',
											'x-exact-debug-session': sessionId
										}
									}
								: {})
						}
					),
					context
				);
			try {
				if (!forwarded) await open();
				if (retirement === 'pre-abort') owner.abort(null);
				const response = query().then(
					(value) => ({ ok: true as const, value }),
					(error: unknown) => ({ ok: false as const, error })
				);
				if (retirement !== 'pre-abort') {
					await started;
					if (retirement === 'session')
						await api.handleExactRequest(
							request({ type: 'debug', version: 1, request: 'close', sessionId }),
							context
						);
					else if (retirement === 'runtime') await context.debugRuntime.close();
					else if (retirement === 'abort') owner.abort(null);
					else {
						if (!advanceClock) throw new Error('Expiry control needs an owned clock');
						advanceClock();
					}
					if (reject) fail(new Error('retired-private-state'));
					else
						complete({
							protocol: 1,
							id: 'pending',
							ok: true,
							identity: { sessionId },
							result: 'retired-private-state'
						});
				}
				const settled = await response;
				if (retirement === 'pre-abort') {
					if (settled.ok || settled.error !== null || queries || audits.length)
						throw new Error('Initial cancellation lost its reason or activated a query');
				} else {
					if (!settled.ok) throw new Error('A settled query unexpectedly rejected its response');
					const retired = settled.value;
					const body = await api.exactResponseToFetchResponse(retired).text();
					if (retired.status !== 404 || body.includes('retired-private-state') || audits.length)
						throw new Error(
							`Retired ${retirement} query published or audited an obsolete result (forwarded: ${forwarded}, rejected: ${reject})`
						);
				}
				live = true;
				if (retirement === 'runtime')
					context.debugRuntime = api.createExactServerDebugRuntime(context);
				if (!forwarded) await open();
				const active = await api.handleExactRequest(
					request(
						{
							type: 'debug',
							version: 1,
							request: 'query',
							sessionId,
							query: { protocol: 1, id: 'live', method: 'components.tree' }
						},
						forwarded
							? {
									headers: {
										origin: 'http://localhost',
										'x-exact-debug-binding': 'remote',
										'x-exact-debug-session': sessionId
									}
								}
							: {}
					),
					context
				);
				if (
					active.status !== 200 ||
					audits.length !== 1 ||
					!(await api.exactResponseToFetchResponse(active).text()).includes('live-state')
				)
					throw new Error('A fresh inspection owner could not publish its authorized query');
			} finally {
				owner.abort();
				await context.debugRuntime.close();
			}
		}
	}
}
