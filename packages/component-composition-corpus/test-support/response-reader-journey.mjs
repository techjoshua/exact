/** Checks that JSON-only adapters reject serialization hooks without executing rejected values. */
export async function verifyJsonResponseOwnership({ invokeExact, invokeExactBatch }) {
	const check = (value, message) => {
		if (!value) throw new Error('Response reader: ' + message);
	};
	for (const batch of [false, true]) {
		for (const maxBytes of [undefined, 256]) {
			for (const kind of ['plain', 'getter', 'toJSON']) {
				let reads = 0;
				const result = { ok: true, type: 'invoke', id: 'owned', value: 'ready' };
				if (kind === 'getter')
					Object.defineProperty(result, 'value', {
						enumerable: true,
						get() {
							reads++;
							return 'changed';
						}
					});
				if (kind === 'toJSON')
					Object.defineProperty(result, 'toJSON', {
						value() {
							reads++;
							return { ...result, value: 'changed' };
						}
					});
				const body = batch ? { ok: true, version: 1, results: [result] } : result;
				const options = {
					endpoint: '/__exact',
					streamLimits: { maxBytes },
					fetch: async () => ({ ok: true, status: 200, json: async () => body })
				};
				let output, failure;
				try {
					output = batch
						? await invokeExactBatch({ ...options, operations: [{ type: 'invoke', id: 'owned' }] })
						: await invokeExact({ ...options, type: 'invoke', id: 'owned' });
				} catch (error) {
					failure = error;
				}
				check(reads === 0, kind + ' executed during byte measurement');
				if (kind === 'plain') {
					check(
						!failure && (batch ? output[0].value : output.value) === 'ready',
						'valid JSON-only response'
					);
				} else
					check(
						failure instanceof Error && failure.message.includes('malformed'),
						kind + ' was not rejected'
					);
			}
		}
	}
	for (const kind of ['plain', 'getter', 'toJSON']) {
		let reads = 0;
		const body = { error: 'exact_build_unsupported' };
		if (kind === 'getter')
			Object.defineProperty(body, 'error', {
				enumerable: true,
				get() {
					reads++;
					return 'exact_build_unsupported';
				}
			});
		if (kind === 'toJSON')
			Object.defineProperty(body, 'toJSON', {
				value() {
					reads++;
					return { error: 'exact_build_unsupported' };
				}
			});
		let failure;
		try {
			await invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'owned',
				logger: { log() {} },
				fetch: async () => ({ ok: false, status: 410, json: async () => body })
			});
		} catch (error) {
			failure = error;
		}
		check(reads === 0, kind + ' executed in failure response accounting');
		check(failure instanceof Error, 'failure response did not reject');
		check(
			(failure.code === 'exact_build_unsupported') === (kind === 'plain'),
			'failure envelope classification'
		);
	}
}
