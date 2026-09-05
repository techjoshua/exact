import {
	RequestContext,
	createRequestContextValue,
	type RequestResponseState
} from '@exactjs/request';
import { installNodeRequestContext } from '@exactjs/request/node';
import { renderToStringAsync } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { Navigate, Router } from './components.js';

const requestScope = installNodeRequestContext();

describe('native router server artifact', () => {
	it('reads ambient request URLs and records redirects', async () => {
		const response: RequestResponseState = { headers: new Headers(), committed: false };
		const request = createRequestContextValue(
			{ url: 'https://example.test/old', publicOrigin: 'https://example.test' },
			response
		);
		await requestScope.run(request, () =>
			renderToStringAsync(
				<Router
					routes={[
						{
							path: 'old',
							render: () => <Navigate to="/new" status={301} />
						}
					]}
				/>
			)
		);
		expect(response.redirect).toEqual({
			location: new URL('https://example.test/new'),
			status: 301
		});
	});

	it('prefers explicitly propagated request context', async () => {
		const response: RequestResponseState = { headers: new Headers(), committed: false };
		const request = createRequestContextValue(
			{
				url: 'https://example.test/explicit',
				publicOrigin: 'https://example.test'
			},
			response
		);
		const rendered = await renderToStringAsync(
			<Router
				routes={[
					{
						path: 'explicit',
						render: () => <Navigate to="/next" status={308} />
					}
				]}
			/>,
			{ contexts: new Map([[RequestContext.id, request]]) }
		);
		expect(rendered.html).toContain('exact:component');
		expect(response.redirect).toEqual({
			location: new URL('https://example.test/next'),
			status: 308
		});
	});
});
