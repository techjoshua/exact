import type { ExactServerContext, ExactServerDebugRuntime } from '@exactjs/server';

type ResponseEncodingContext = Pick<
	ExactServerContext,
	| 'contract'
	| 'publicOrigin'
	| 'allowDebug'
	| 'debugLimits'
	| 'inspectionQueryService'
	| 'onDebugAudit'
>;
type ResponseEncodingApi = {
	createExactServerDebugRuntime(
		context: ResponseEncodingContext
	): Pick<ExactServerDebugRuntime, 'handle' | 'close'>;
	exactResponseToFetchResponse: typeof import('@exactjs/server').exactResponseToFetchResponse;
};

/** Checks one settled wire body owns snapshot budgets, auditing and delivery on every host. */
export async function verifyInspectionResponseEncoding(api: ResponseEncodingApi): Promise<void> {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('Inspection response encoding: ' + message);
	};
	const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
	const snapshot = async (result: unknown, audit?: (size: number) => void) => {
		let sessionId = '';
		const context: ResponseEncodingContext = {
			contract: {
				version: 1,
				endpoint: '/__exact',
				invocations: {},
				executors: {},
				boundaries: {}
			},
			publicOrigin: 'https://app.test',
			allowDebug: true,
			debugLimits: { maxSnapshotBytes: 512 },
			inspectionQueryService: {
				async request(request) {
					return { protocol: 1, id: request.id, ok: true, identity: { sessionId }, result };
				},
				subscribe() {
					return { closed: true, close() {} };
				}
			},
			...(audit ? { onDebugAudit: (event) => audit(event.resultBytes) } : {})
		};
		const runtime = api.createExactServerDebugRuntime(context);
		try {
			const request = {
				method: 'POST',
				url: 'https://app.test/__exact',
				headers: { origin: 'https://app.test' }
			};
			const opened = await api
				.exactResponseToFetchResponse(
					await runtime.handle(request, {
						type: 'debug',
						version: 1,
						request: 'open',
						capabilities: ['snapshot']
					})
				)
				.json();
			sessionId = opened.session.id;
			const response = api.exactResponseToFetchResponse(
				await runtime.handle(request, {
					type: 'debug',
					version: 1,
					request: 'query',
					sessionId,
					query: { protocol: 1, id: 'snapshot', method: 'components.tree' }
				})
			);
			return { status: response.status, body: await response.text() };
		} finally {
			await runtime.close();
		}
	};
	for (const audited of [false, true]) {
		let reads = 0;
		let auditBytes = 0;
		const response = await snapshot(
			{
				get value() {
					return ++reads === 1 ? 'checked' : 'x'.repeat(1024);
				}
			},
			audited
				? (size) => {
						auditBytes = size;
					}
				: undefined
		);
		check(response.status === 200, 'valid snapshot succeeds');
		check(
			JSON.parse(response.body).result.value === 'checked',
			'delivered value is the checked value'
		);
		check(reads === 1, 'value is read once with audit=' + audited);
		check(bytes(response.body) <= 512, 'delivered snapshot respects its byte budget');
		if (audited) check(auditBytes === bytes(response.body), 'audit describes delivered bytes');
	}
	let auditBytes = 0;
	const collection = await snapshot(new Map([['label', '😀']]), (size) => {
		auditBytes = size;
	});
	check(collection.status === 200, 'encoded collection succeeds');
	check(
		JSON.parse(collection.body).result.$exact === 'map',
		'collection uses its wire representation'
	);
	check(auditBytes === bytes(collection.body), 'collection audit counts encoded UTF-8 bytes');

	const ascii = await snapshot('x'.repeat(300));
	check(ascii.status === 200, 'within-budget ASCII control succeeds');
	const unicode = await snapshot('😀'.repeat(110), (size) => {
		auditBytes = size;
	});
	check(
		unicode.status === 404 && JSON.parse(unicode.body).error === 'limit-exceeded',
		'UTF-8 budget rejects multibyte overflow'
	);
	check(auditBytes === bytes(unicode.body), 'overflow audit counts the failure body');
	const invalid = await snapshot(1n);
	check(
		invalid.status === 404 && JSON.parse(invalid.body).error === 'limit-exceeded',
		'unencodable value has a structured failure'
	);

	let audits = 0;
	const observerFailure = await snapshot('ok', () => {
		audits++;
		throw new Error('observer failure');
	});
	check(
		observerFailure.status === 200 &&
			JSON.parse(observerFailure.body).result === 'ok' &&
			audits === 1,
		'audit failure preserves delivery'
	);
}
