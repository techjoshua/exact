type Api = Pick<
	typeof import('@exactjs/devtools-protocol'),
	'parseExactInspectionRequest' | 'parseExactInspectionSubscription'
>;

function rejectsLimit(run: () => unknown): void {
	try {
		run();
	} catch (error) {
		if (error instanceof RangeError) return;
		throw error;
	}
	throw new Error('Invalid configured inspection limit was accepted');
}

/** Enforces configured safe-integer query budgets before optional fields, with valid boundary controls. */
export function verifyInspectionQueryLimits(api: Api): void {
	const query = { protocol: 1, id: 'q', method: 'roots.list' };
	const subscription = { protocol: 1, sessionId: 's' };
	for (const maximum of [NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
		for (const params of [undefined, { page: { limit: 501 } }])
			rejectsLimit(() =>
				api.parseExactInspectionRequest({ ...query, params }, { maxResults: maximum })
			);
		rejectsLimit(() => api.parseExactInspectionRequest(query, { maxFilterKinds: maximum }));
		rejectsLimit(() =>
			api.parseExactInspectionSubscription(subscription, { maxFilterKinds: maximum })
		);
	}
	rejectsLimit(() => api.parseExactInspectionRequest(query, { maxResults: 0 }));
	const bounded = { ...query, params: { page: { limit: 1 } } };
	if (api.parseExactInspectionRequest(bounded, { maxResults: 1 }).params?.page?.limit !== 1)
		throw new Error('Valid configured query boundary was rejected');
	rejectsLimit(() =>
		api.parseExactInspectionRequest(
			{ ...bounded, params: { page: { limit: 2 } } },
			{ maxResults: 1 }
		)
	);
	for (const parse of [
		(kinds: string[]) =>
			api.parseExactInspectionRequest(
				{ ...query, params: { filter: { kinds } } },
				{ maxFilterKinds: 0 }
			),
		(kinds: string[]) =>
			api.parseExactInspectionSubscription(
				{ ...subscription, filter: { kinds } },
				{ maxFilterKinds: 0 }
			)
	]) {
		parse([]);
		rejectsLimit(() => parse(['error']));
	}
}
