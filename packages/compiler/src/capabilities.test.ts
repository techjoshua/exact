import { describe, expect, it } from 'vitest';
import { transformSource } from './index.js';
import { analyzeSource } from './compilation/source-analysis.js';

const rawHtmlSource = `
  import { unsafeHtml as raw } from "@exactjs/core";
  import * as exact from "@exactjs/core";
  export function Article() {
    return () => <main>{raw("<b>article</b>")}{exact.unsafeHtml("<i>tail</i>")}</main>;
  }
`;

describe('unsafeHtml package capabilities', () => {
	it('records source locations, owning symbols, and conservative targets for libraries', () => {
		const analysis = analyzeSource(rawHtmlSource, {
			filename: 'src/article.tsx',
			packageType: 'library',
			packageName: '@acme/articles'
		});

		expect(analysis.packageName).toBe('@acme/articles');
		expect(analysis.requiredCapabilities?.rawHtml).toEqual([
			expect.objectContaining({
				source: 'src/article.tsx',
				symbol: 'Article',
				targets: ['client', 'server']
			}),
			expect.objectContaining({
				source: 'src/article.tsx',
				symbol: 'Article',
				targets: ['client', 'server']
			})
		]);
		expect(analysis.diagnostics).not.toContainEqual(
			expect.stringContaining('unsafeHtml capability')
		);
	});

	it('requires explicit application opt-in for application-owned call sites', () => {
		expect(() =>
			transformSource(rawHtmlSource, {
				filename: 'src/article.tsx',
				packageType: 'application',
				packageName: 'my-app'
			})
		).toThrow(/has not explicitly enabled/);

		const client = transformSource(rawHtmlSource, {
			filename: 'src/article.tsx',
			packageType: 'application',
			packageName: 'my-app',
			capabilityPolicy: { unsafeHtml: { enabled: true } }
		});
		expect(client.code).toContain('import "@exactjs/dom/runtime/unsafe-html"');

		const server = transformSource(rawHtmlSource, {
			filename: 'src/article.tsx',
			packageType: 'application',
			packageName: 'my-app',
			target: 'server',
			capabilityPolicy: { unsafeHtml: { enabled: true } }
		});
		expect(server.code).not.toContain('@exactjs/dom/runtime/unsafe-html');
	});
});
