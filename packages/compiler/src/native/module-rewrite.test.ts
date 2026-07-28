import { describe, expect, it } from 'vitest';
import { transformSource } from '../compilation/transformation.js';

const provider = {
	sourceModule: '@tanstack/react-query',
	sourceExport: 'QueryClientProvider',
	targetModule: '@exactjs/tanstack-query/provider',
	targetExport: 'ExactQueryClientProvider'
} as const;

describe('native module rewriting', () => {
	it('preserves the structured replacement contract without a JavaScript AST pass', () => {
		const source = `
			import {
				QueryClientProvider as Provider,
				useQuery,
				type QueryKey
			} from "@tanstack/react-query";
			import * as Query from "@tanstack/react-query";
			export {
				QueryClientProvider as ExportedProvider,
				useQuery as exportedQuery
			} from "@tanstack/react-query";
			const DirectProvider = require("@tanstack/react-query").QueryClientProvider;
			const {
				QueryClientProvider: DestructuredProvider,
				useQuery: destructuredQuery
			} = require("@tanstack/react-query");
			Query.QueryClientProvider;
			function shadow(Query: any) {
				return Query.QueryClientProvider;
			}
			console.log(
				Provider,
				useQuery,
				DirectProvider,
				DestructuredProvider,
				destructuredQuery,
				shadow
			);
		`;
		const options = {
			filename: 'module.ts',
			moduleRewrite: { replacements: [provider] },
			sourceMap: true
		} as const;
		const native = transformSource(source, options);
		const legacy = transformSource(source, { ...options, compiler: 'legacy' });

		for (const output of [native.code, legacy.code]) {
			expect(output).toContain('import { useQuery, type QueryKey } from "@tanstack/react-query";');
			expect(output).toContain(
				'import { ExactQueryClientProvider as Provider } from "@exactjs/tanstack-query/provider";'
			);
			expect(output).toContain(
				'export { ExactQueryClientProvider as ExportedProvider } from "@exactjs/tanstack-query/provider";'
			);
			expect(output).toContain(
				'require("@exactjs/tanstack-query/provider").ExactQueryClientProvider'
			);
			expect(output).toContain(
				'{ ExactQueryClientProvider: DestructuredProvider } = require("@exactjs/tanstack-query/provider")'
			);
			expect(output).toContain('return Query.QueryClientProvider;');
		}
		expect(native.code).toMatch(
			/import \{ ExactQueryClientProvider as __exact_ExactQueryClientProvider(?:_\d+)? \}/
		);
		expect(native.map).toMatchObject({
			version: 3,
			sources: ['module.ts'],
			sourcesContent: [source]
		});
	});
});
