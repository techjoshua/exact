import { analyzeSource } from '@exactjs/compiler';
import { describe, expect, it } from 'vitest';
import { exact } from './index.js';

describe('@exactjs/vite-plugin: transform', () => {
	it('rejects server artifact reachability in final client chunks', () => {
		const plugin = exact();

		expect(() =>
			plugin.generateBundle?.(
				{},
				{
					'page.js': {
						type: 'chunk',
						fileName: 'page.js',
						modules: {
							'/src/page.exact.client.ts': {},
							'/src/private.exact.server.ts': {}
						}
					}
				}
			)
		).toThrow('page.js: module /src/private.exact.server.ts');
	});

	it('rejects inspection catalogs in final client output', () => {
		const plugin = exact();
		expect(() =>
			plugin.generateBundle?.(
				{},
				{
					'.exact-inspection/build.json': {
						type: 'asset',
						fileName: '.exact-inspection/build.json'
					}
				}
			)
		).toThrow('.exact-inspection/build.json');
	});

	it('forwards profiling into its compiler session', () => {
		const events: Array<{ subsystem: string; phase: string }> = [];
		const plugin = exact({
			reactCompatibility: false,
			onProfile: (event) => events.push(event)
		});

		plugin.transform('const view = <span />;', '/src/profiled.tsx');

		expect(events).toContainEqual(
			expect.objectContaining({
				subsystem: 'compiler',
				phase: 'native-request'
			})
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				subsystem: 'vite-plugin',
				phase: 'transform'
			})
		);
	});

	it('transforms matching tsx files', () => {
		const plugin = exact({ reactCompatibility: false });
		const result = plugin.transform('const view = <span />;', '/src/view.tsx');

		expect(result?.code).toContain('__exactVNode("span"');
		expect(result?.map).toMatchObject({
			version: 3,
			sources: ['/src/view.tsx'],
			sourcesContent: ['const view = <span />;']
		});
	});

	it('runs prepared compiler policies for plain TypeScript modules', () => {
		const plugin = exact({
			reactCompatibility: false,
			pluginRegistry: {
				fingerprint: 'test',
				plugins: {
					'@exactjs/policy': {
						packageName: '@exactjs/policy',
						version: '1.0.0',
						protocolVersion: '1.0.0',
						required: true,
						cacheKey: 1,
						extension: {
							namespace: 'policy',
							directives: ['source'],
							include: /\.ts$/,
							analyzeModule: () => ({
								diagnostics: [
									{ severity: 'error', code: 'blocked', message: 'plain TS was analyzed' }
								]
							})
						}
					}
				}
			}
		});
		expect(() =>
			plugin.transform('/** @exact policy.source */\nexport const value = 1;', '/src/value.ts')
		).toThrow('plain TS was analyzed');
	});

	it('passes compiler targets through to transformed files', () => {
		const plugin = exact({ target: 'client', reactCompatibility: false });
		const result = plugin.transform(
			`
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{ title?: string }>) {
        this.task(async () => {
          this.state.title = await readFile("title.txt", "utf8");
        });
        return () => <p>{this.state.title}</p>;
      }
    `,
			'/src/page.tsx'
		);

		expect(result?.code).not.toContain('node:fs/promises');
		expect(result?.code).not.toContain('readFile');
	});

	it('passes imported manifests through to the compiler', () => {
		const manifest = analyzeSource(
			`
      export function ClientWidget(this: Component<{ width: number }>) {
        this.state.width = window.innerWidth;
        return () => <button onClick={() => this.state.width++} />;
      }
    `,
			{ filename: '/src/ClientWidget.tsx' }
		);
		const plugin = exact({
			target: 'server',
			importedManifests: [manifest],
			reactCompatibility: false
		});
		const result = plugin.transform(
			`
      import { ClientWidget } from "./ClientWidget";
      export function Page() {
        return () => <ClientWidget />;
      }
    `,
			'/src/Page.tsx'
		);

		expect(result?.code).toContain('__exactBoundary');
		expect(result?.code).toContain('"ClientWidget"');
		expect(result?.code).not.toContain('from "./ClientWidget"');
	});

	it('passes server component mode through to client transforms', () => {
		const plugin = exact({ target: 'client', serverComponents: true, reactCompatibility: false });
		const result = plugin.transform(
			`
      import { readFile } from "node:fs/promises";
      export function Page(this: Component<{ count: number }>) {
        this.task.server(async () => {
          await readFile("page.txt", "utf8");
        });
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `,
			'/src/Page.tsx'
		);

		expect(result?.code).toContain('Page_ExactClient_1');
		expect(result?.code).not.toContain('export function Page(');
	});

	it('resolves exact facade imports to target artifacts', () => {
		expect(
			exact({ target: 'client', reactCompatibility: false }).resolveId?.(
				'./Panel.exact',
				'/app/src/main.ts'
			)
		).toMatch(/Panel\.exact\.client\.ts$/);
		expect(
			exact({ target: 'server', reactCompatibility: false }).resolveId?.(
				'./Panel.exact',
				'/app/src/main.ts'
			)
		).toMatch(/Panel\.exact\.server\.ts$/);
		expect(
			exact({ reactCompatibility: false }).resolveId?.('./Panel', '/app/src/main.ts')
		).toBeNull();
	});

	it('adds target export conditions for packaged exact artifacts', () => {
		expect(exact({ target: 'client', reactCompatibility: false }).config?.()).toMatchObject({
			resolve: { conditions: ['exact-client'] }
		});
		expect(exact({ target: 'server', reactCompatibility: false }).config?.()).toMatchObject({
			resolve: { conditions: ['exact-server'] }
		});
	});

	it('emits one server-only catalog asset with explicit production debug output', () => {
		const emitted: Array<{ type: 'asset'; fileName: string; source: string }> = [];
		const plugin = exact({
			target: 'server',
			applicationRoot: process.cwd(),
			reactCompatibility: false,
			debug: {
				catalog: true,
				runtime: true,
				buildKey: 'immutable-build',
				executionRoot: 'page'
			}
		});
		plugin.transform(
			`export function Page(this: Component<{}>) { return () => <main />; }`,
			`${process.cwd()}/src/Page.tsx`
		);
		plugin.generateBundle?.call(
			{ emitFile: (asset) => (emitted.push(asset), 'inspection') },
			{},
			{}
		);

		expect(emitted).toHaveLength(1);
		expect(emitted[0]!.fileName).toBe('.exact-inspection/immutable-build.json');
		expect(JSON.parse(emitted[0]!.source)).toMatchObject({
			protocol: 1,
			buildKey: 'immutable-build',
			roots: { page: { executionRoot: 'page' } }
		});
	});

	it('derives independent auto runtime and hardened controls', () => {
		const development = exact({ target: 'client', reactCompatibility: false });
		development.configResolved?.({ command: 'serve' });
		const instrumented = development.transform(
			`export function Page(this: Component<{}>) { return () => <main />; }`,
			'/src/Page.tsx'
		);
		expect(instrumented?.code).toContain('@exactjs/devtools-runtime');

		const hardened = exact({
			target: 'client',
			reactCompatibility: false,
			debug: { catalog: false, runtime: false }
		});
		hardened.configResolved?.({ command: 'serve' });
		const output = hardened.transform(
			`export function Page(this: Component<{}>) { return () => <main />; }`,
			'/src/Page.tsx'
		);
		expect(output?.code).not.toContain('@exactjs/devtools');
	});

	it('injects the page-world runtime before application modules only when instrumented', () => {
		const development = exact({
			target: 'client',
			debug: { runtime: true, buildKey: 'build-client', executionRoot: 'page' }
		});
		development.configResolved?.({ command: 'build' });
		const html = development.transformIndexHtml!.handler(
			'<body><script type="module" src="/src/main.ts"></script></body>'
		);
		expect(html.indexOf('virtual:exact/devtools-runtime')).toBeLessThan(
			html.indexOf('/src/main.ts')
		);
		expect(
			development.resolveId?.('virtual:exact/devtools-runtime')
		).toBe('\0virtual:exact/devtools-runtime');
		expect(
			development.load?.('\0virtual:exact/devtools-runtime')
		).toMatchObject({
			code: expect.stringContaining('"buildKey":"build-client"')
		});

		const hardened = exact({ target: 'client', debug: { runtime: false } });
		hardened.configResolved?.({ command: 'serve' });
		expect(hardened.transformIndexHtml!.handler('<body></body>')).not.toContain(
			'exact/devtools-runtime'
		);
	});
});
