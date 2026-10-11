/** Provides the installed fixture's document, operation dispatch and transport evidence over Fetch. */
export function createInstalledIslandsFetch(application) {
	const requests = [];
	const errors = [];
	return async (request) => {
		const url = new URL(request.url);
		if (url.pathname === '/__acceptance') return Response.json({ requests, errors });
		requests.push({ method: request.method, path: url.pathname });
		try {
			if (url.pathname === '/' && request.method === 'GET') {
				const rendered = await application.renderPage();
				return new Response(rendered.htmlWithHydration, {
					headers: { 'content-type': 'text/html' }
				});
			}
			return await application.handleExact(request);
		} catch (error) {
			errors.push(String(error));
			throw error;
		}
	};
}
