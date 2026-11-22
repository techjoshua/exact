/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { render, unmount } from '@exactjs/dom';
import { renderToString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { artifactAnalysis } from './analysis-results.js';
import { createBrowserTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

const dormant = (get: string) => `
	const table = { get run() {
		trace += 'get,';
		${get}
		return () => { trace += 'call,'; void document.title; throw new Error('call-stop'); };
	}};
	const saved = table.run;
	return typeof saved;
`;

const cases = [
	{
		name: 'throwing getter stops the call and its arguments',
		body: `
			const table = { get run(): (arg: string) => string {
				trace += 'get,';
				void window.name;
				throw new Error('get-stop');
			}};
			try { return table.run((trace += 'argument,')); }
			catch (error) { return (error as Error).message; }
		`,
		text: 'get-stop',
		trace: 'get,',
		browser: ['window']
	},
	{
		name: 'the returned throwing callback stays dormant on either target',
		body: dormant(''),
		text: 'function',
		trace: 'get,',
		browser: [],
		unresolved: false
	},
	{
		name: 'only the eager getter determines browser placement',
		body: dormant('void window.name;'),
		text: 'function',
		trace: 'get,',
		browser: ['window'],
		unresolved: false
	},
	{
		name: 'a saved callable survives container replacement',
		body: `
			let table = { get run() {
				trace += 'original-get,';
				void window.name;
				return () => { trace += 'original-call,'; return document.title; };
			}};
			const saved = table.run;
			table = { get run() {
				trace += 'replacement-get,';
				return () => 'replacement';
			}};
			return saved();
		`,
		text: 'browser value',
		trace: 'original-get,original-call,',
		browser: ['window', 'document']
	},
	{
		name: 'member and detached calls keep distinct receivers',
		body: `
			const table = { label: 'member', get run() {
				trace += 'get,';
				return function (this: { label: string } | void) {
					return this === undefined ? 'detached' : this.label;
				};
			}};
			const member = table.run();
			const saved = table.run;
			return member + ':' + saved();
		`,
		text: 'member:detached',
		trace: 'get,get,',
		browser: []
	},
	{
		name: 'browser calls preceding an unresolved sibling',
		body: `
			const table = { get run() {
				trace += 'get,';
				void window.name;
				return () => { trace += 'call,'; return document.title; };
			}};
			const saved = table.run;
			const result = saved();
			foreign();
			return result;
		`,
		text: 'browser value',
		trace: 'get,call,',
		browser: ['window', 'document'],
		unresolved: true
	}
];

it.each(cases)('preserves $name through a compiled component', async (scenario) => {
	const root = await createBrowserTestWorkspace('.exact-getter-call-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': `
			declare function foreign(): void;
			export let trace = '';
			function read() { ${scenario.body} }
			export function Page() { const value = read(); return () => <p>{value}</p>; }
			export const view = () => <Page/>;
		`
	});

	for (const packageType of ['application', 'library'] as const) {
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, packageType),
			serverComponents: true,
			packageType
		});
		const analysis = artifactAnalysis(artifact!);
		const browserOnly = scenario.browser.length > 0;
		const page = analysis.components.find((component) => component.name === 'Page');
		expect(page?.placement).toBe(browserOnly ? 'client' : 'isomorphic');
		const setup = analysis.callables.find((callable) => callable.name === 'Page');
		expect(setup).toBeDefined();
		const sources = setup!.effectSources;
		expect(
			new Set(
				sources
					.filter((effect) => effect.environment === 'browser')
					.map((effect) => effect.description)
			)
		).toEqual(new Set(scenario.browser));
		if (scenario.unresolved !== undefined) {
			expect(sources.some((effect) => effect.environment === 'unknown')).toBe(scenario.unresolved);
		}
		const server = await importArtifact(
			artifact!.serverFile,
			path.join(root, packageType + '-server.mjs')
		);
		const client = await importArtifact(
			artifact!.clientFile,
			path.join(root, packageType + '-client.mjs')
		);
		const serverView = server.view as () => Parameters<typeof renderToString>[0];
		const clientView = client.view as () => Parameters<typeof render>[0];

		const host = document.createElement('div');
		const title = document.title;
		vi.stubGlobal('window', undefined);
		vi.stubGlobal('document', undefined);
		try {
			const { html } = await renderToString(serverView(), { markers: false });
			if (browserOnly) {
				expect(html).toContain('data-exact-client-boundary=');
				expect(server.trace).toBe('');
			} else {
				expect(html).toBe(`<p>${scenario.text}</p>`);
				expect(server.trace).toBe(scenario.trace);
			}
		} finally {
			vi.unstubAllGlobals();
		}

		const reports: unknown[] = [];
		try {
			document.title = 'browser value';
			const foreign = vi.fn(() => expect(client.trace).toBe(scenario.trace));
			if (scenario.unresolved) vi.stubGlobal('foreign', foreign);
			render(clientView(), host, { onErrorReport: (report) => reports.push(report.error) });
			expect(reports).toEqual([]);
			expect(host.textContent).toBe(scenario.text);
			expect(client.trace).toBe(scenario.trace);
			if (scenario.unresolved) expect(foreign).toHaveBeenCalledTimes(1);
		} finally {
			unmount(host);
			document.title = title;
			vi.unstubAllGlobals();
		}
	}
});
