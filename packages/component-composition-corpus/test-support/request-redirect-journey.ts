type Api = Pick<
	typeof import('@exactjs/request'),
	'createRequestContextValue' | 'commitRequestResponseState'
>;

/** Validates redirect preparation before publishing response status, location and headers. */
export function verifyRequestRedirectTransaction(
	api: Api,
	invalidLocations = ['http://[', '/bad\nlocation']
): void {
	for (const invalid of invalidLocations) {
		const response: import('@exactjs/request').RequestResponseState = {
			headers: new Headers(),
			committed: false
		};
		const request = api.createRequestContextValue({ url: '/current' }, response);
		request.redirect('/before', 307);
		const previous = response.redirect;
		const status = () => response.status;
		let failed = false;
		try {
			request.redirect(invalid, 308);
		} catch {
			failed = true;
		}
		if (
			!failed ||
			status() !== 307 ||
			response.redirect !== previous ||
			response.headers.get('location') !== '/before'
		)
			throw new Error('Invalid redirect partially published response controls');
		request.redirect('/after', 308);
		const committed = api.commitRequestResponseState(response);
		if (
			committed.status !== 308 ||
			committed.headers.get('location') !== '/after' ||
			committed.redirect?.location.pathname !== '/after'
		)
			throw new Error('Valid redirect did not recover after rejected input');
		try {
			request.redirect('/late', 302);
		} catch {}
		if (status() !== 308 || response.headers.get('location') !== '/after')
			throw new Error('Committed redirect mutated response controls');
	}
}
