/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import { createElement } from '@exactjs/react-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderToString } from './server-node.js';

let ThemeProvider: any;
let useTheme: any;
let QueryClient: any;
let QueryClientProvider: any;
let useQuery: any;

beforeAll(async () => {
	({ ThemeProvider, useTheme, QueryClient, QueryClientProvider, useQuery } = await import(
		'../fixtures/phase3.mjs'
	));
});

describe('React compatibility Phase 5 package fixtures', () => {
	it('server-renders Emotion context without running client effects', () => {
		function ThemeValue() {
			const theme = useTheme();
			return createElement('span', null, theme.brand);
		}
		expect(
			renderToString(
				createElement(ThemeProvider, { theme: { brand: 'server-blue' } }, createElement(ThemeValue))
			)
		).toContain('<span>server-blue</span>');
	});

	it('server-renders a TanStack Query with seeded request data', () => {
		const client = new QueryClient();
		client.setQueryData(['phase5'], 'server-query');
		function QueryValue() {
			const query = useQuery({ queryKey: ['phase5'], queryFn: () => Promise.resolve('unused') });
			return createElement('strong', null, query.data);
		}
		expect(
			renderToString(createElement(QueryClientProvider, { client }, createElement(QueryValue)))
		).toContain('<strong>server-query</strong>');
	});
});
