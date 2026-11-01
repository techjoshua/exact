import { createExactContextRuntime } from '@exactjs/server';

/** Checks normalized request authority through the portable server scope on each native host. */
export async function requestOriginJourney() {
	const results = [];
	for (const publicOrigin of [undefined, 'https://shop.example.test']) {
		const runtime = createExactContextRuntime({ publicOrigin });
		try {
			const opened = await runtime.open({
				method: 'GET',
				url: 'https://untrusted.example//attacker.example/orders?open=1',
				headers: { host: 'untrusted.example' }
			});
			try {
				results.push({
					origin: opened.request.url.origin,
					pathname: opened.request.url.pathname,
					search: opened.request.url.search
				});
			} finally {
				await opened.dispose();
			}
		} finally {
			await runtime.dispose();
		}
	}
	return results;
}
