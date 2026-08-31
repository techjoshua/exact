import { describe, expect, it } from 'vitest';
import { analyzeIntlSource } from '@exactjs/intl-analyzer';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exact as createExact } from './index.js';
import { projectTestTargetComponentImports } from './transform.js';

const exact = (...args: Parameters<typeof createExact>) =>
	createExact(...args) as Omit<ReturnType<typeof createExact>, 'transform'> & {
		transform(
			...values: Parameters<ReturnType<typeof createExact>['transform']>
		): Awaited<ReturnType<ReturnType<typeof createExact>['transform']>>;
	};

describe('@exactjs/vite-plugin: transform', () => {
	it('projects only compiler-reported relative component edges into a test target graph', () => {
		const code = `import { Local } from './local.js';\nimport { External } from '@acme/ui';\nconst label = './local.js';`;
		expect(
			projectTestTargetComponentImports(
				code,
				[{ moduleSpecifier: './local.js' }, { moduleSpecifier: '@acme/ui' }],
				'server'
			)
		).toBe(
			`import { Local } from './local.js?exact-target=server';\nimport { External } from '@acme/ui';\nconst label = './local.js';`
		);
	});

	it('rejects server artifact reachability in final client chunks', () => {
		const plugin = exact();

		expect(() =>
			plugin.generateBundle?.call(
				{},
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
			plugin.generateBundle?.call(
				{},
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

		expect(result?.code).toContain('__exactPreparedRenderProgram(__exact_render_program_1');
		expect(result?.map).toMatchObject({
			version: 3,
			sources: ['/src/view.tsx'],
			sourcesContent: ['const view = <span />;']
		});
	});

	it('does not project component contracts for ordinary SSR-loaded TypeScript', () => {
		const plugin = exact({ reactCompatibility: false, renderMode: 'client' });

		expect(
			plugin.transform('export const label = "ordinary";', '/src/utility.ts', { ssr: true })
		).toBeNull();
	});

	it('projects component contracts for the configured browser render mode', () => {
		const source = `export function Counter() {
			this.state.count = 0;
			return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
		}`;
		const hydrated = exact({ reactCompatibility: false, renderMode: 'hydrate' }).transform(
			source,
			'/src/Counter.tsx'
		);
		const client = exact({ reactCompatibility: false, renderMode: 'client' }).transform(
			source,
			'/src/Counter.tsx'
		);

		expect(hydrated?.code).toContain('resumption:');
		expect(hydrated?.code).not.toContain('render: "returned-function"');
		expect(hydrated?.code).not.toContain('reactive: [');
		expect(client?.code).not.toContain('resumption:');
	});

	it('projects SSR-only server contracts without continuation executors', () => {
		const source = `import { TaskContext } from '@exactjs/core';
			export function Loader() {
				async function load(_task: TaskContext = TaskContext.server()) { return 1; }
				load();
				return () => <output>ready</output>;
			}`;
		const rendered = exact({
			reactCompatibility: false,
			target: 'server',
			renderMode: 'server-render'
		}).transform(source, '/src/Loader.tsx');

		expect(rendered?.code).toContain('role: "render"');
		expect(rendered?.code).toContain('executors: []');
		expect(rendered?.code).not.toContain('execute: async');
	});

	it('runs optional intl analysis before ordinary compilation and extracts descriptors', async () => {
		const extracted: unknown[] = [];
		const clientRequirements: unknown[] = [];
		const source =
			'export function Greeting(props: { name: string }) { return () => <p intl:message>Hello {props.name}</p>; }';
		const key = analyzeIntlSource(source, {
			filename: `${process.cwd()}/src/Greeting.tsx`,
			owner: 'example',
			sourceLocale: 'en-US'
		}).descriptors[0]!.key;
		const catalog = {
			protocol: 1,
			locale: 'fr-FR',
			owner: 'example',
			messages: {
				[key]: [
					{ kind: 'text', value: 'Bonjour ' },
					{ kind: 'placeholder', id: 'n1' }
				]
			}
		};
		const plugin = exact({
			reactCompatibility: false,
			internationalization: {
				owner: 'example',
				sourceLocale: 'en-US',
				catalogs: [catalog],
				onDescriptors: (descriptors) => extracted.push(...descriptors),
				onClientRequirements: (requirements, moduleId) =>
					clientRequirements.push([requirements, moduleId])
			}
		});
		const result = plugin.transform(source, `${process.cwd()}/src/Greeting.tsx`);

		expect(extracted).toHaveLength(1);
		expect(clientRequirements).toEqual([[[], `${process.cwd()}/src/Greeting.tsx`]]);
		expect(extracted[0]).toMatchObject({
			owner: 'example',
			sourceLocale: 'en-US',
			ownerComponentId: expect.stringMatching(/^x[A-Za-z0-9_-]{22}$/)
		});
		expect(result?.code).toContain('@exactjs/intl/internal');
		expect(result?.code).toContain('@exactjs/intl/enhancements');
		const request = result?.code.match(/from "(virtual:exact-intl\/descriptor\/[^"]+)"/)?.[1];
		expect(request).toBeDefined();
		const resolution = await plugin.resolveId!(request!);
		expect(resolution).toMatchObject({
			id: expect.stringMatching(/^\0virtual:exact-intl\/descriptor\//),
			moduleSideEffects: false
		});
		const resolved = typeof resolution === 'string' ? resolution : resolution!.id;
		expect(plugin.load!(resolved)).toMatchObject({
			code: expect.stringContaining('export const descriptors = Object.freeze')
		});
		expect(plugin.load!(resolved)).toMatchObject({
			code: expect.stringContaining('"locale":"fr-FR"')
		});
		expect(plugin.load!(resolved)).toMatchObject({
			code: expect.stringContaining('__exactRegisterIntlArtifacts')
		});
		expect(plugin.load!(resolved)).toMatchObject({
			code: expect.stringContaining('export const clientRequirements = Object.freeze([])')
		});
		await plugin.buildEnd?.call({}, undefined);
		plugin.watchChange?.(`${process.cwd()}/src/Greeting.tsx`, { event: 'delete' });
		expect(await plugin.load!(resolved)).toBeNull();
	});

	it('rejects intl messages outside compiler-recognized components', () => {
		const plugin = exact({
			reactCompatibility: false,
			internationalization: { owner: 'example', sourceLocale: 'en-US' }
		});

		expect(() =>
			plugin.transform(
				'export const content = <p intl:message>Hello</p>;',
				`${process.cwd()}/src/content.tsx`
			)
		).toThrow('not owned by a compiler-recognized component');
	});

	it('lowers intrinsic property messages through the IntlAttributes enhancement', () => {
		const plugin = exact({
			reactCompatibility: false,
			internationalization: { owner: 'example', sourceLocale: 'en-US' }
		});
		const result = plugin.transform(
			`export function Search({ query }) {
				return () => <input placeholder={\`Search \${query}\`} intl:placeholder />;
			}`,
			`${process.cwd()}/src/Search.tsx`
		);

		expect(result?.code).toContain('@exactjs/intl/enhancements#');
		expect(result?.code).toContain('props: { placeholder:');
		expect(result?.code).toContain('__exactPrepareIntl(__exactIntlDescriptor0, [query], [])');
	});

	it.each([
		['intrinsic', '<output intl:unit="distance-road">{minimum}-{maximum} miles</output>'],
		['fragment', '<_ intl:unit="distance-road">{minimum}-{maximum} miles</_>']
	] as const)('compiles semantic unit ranges on an %s host', (_kind, formatter) => {
		const plugin = exact({
			reactCompatibility: false,
			internationalization: { owner: 'example', sourceLocale: 'en-US' }
		});
		const result = plugin.transform(
			`export function Distance({ minimum, maximum }) {
				return () => ${formatter};
			}`,
			`${process.cwd()}/src/Distance.tsx`
		);

		expect(result?.code).toContain('@exactjs/intl/enhancements#');
		expect(result?.code).toContain('props: { unit:');
		expect(result?.code).toContain('__exactPrepareIntl(__exactIntlDescriptor0, [minimum, maximum]');
	});

	it('compiles inferred currency through the ordinary enhancement path', () => {
		const plugin = exact({
			reactCompatibility: false,
			internationalization: { owner: 'example', sourceLocale: 'en-US' }
		});
		const result = plugin.transform(
			`export function Total({ total }) { return () => <output intl:currency>{total}</output>; }`,
			`${process.cwd()}/src/Total.tsx`
		);

		expect(result?.code).toContain('@exactjs/intl/enhancements#');
		expect(result?.code).toContain('props: { currency:');
	});

	it('rejects catalog keys not produced by the completed analysis generation', async () => {
		const plugin = exact({
			reactCompatibility: false,
			internationalization: {
				owner: 'example',
				sourceLocale: 'en-US',
				catalogs: [
					{
						protocol: 1,
						locale: 'fr',
						owner: 'example',
						messages: { m1_0000000000000000000000000000000000000000000: [] }
					}
				]
			}
		});
		plugin.transform(
			'const View = ({ name }) => <p intl:message>Hello {name}</p>;',
			`${process.cwd()}/src/View.tsx`
		);
		await expect(plugin.buildEnd?.call({}, undefined)).rejects.toThrow('unknown message');
	});

	it('relinks watched catalog files without recompiling component source', async () => {
		const temporary = mkdtempSync(path.join(tmpdir(), 'exact-intl-catalog-'));
		try {
			const filename = `${process.cwd()}/src/RelinkedView.tsx`;
			const source = 'export function View() { return () => <p intl:message>Hello</p>; }';
			const key = analyzeIntlSource(source, {
				filename,
				owner: 'example',
				sourceLocale: 'en-US'
			}).descriptors[0]!.key;
			const catalogFile = path.join(temporary, 'fr.json');
			const writeCatalog = (message: string) =>
				writeFileSync(
					catalogFile,
					JSON.stringify({
						protocol: 1,
						locale: 'fr',
						owner: 'example',
						messages: { [key]: [{ kind: 'text', value: message }] }
					})
				);
			writeCatalog('Bonjour');
			const watched: string[] = [];
			const plugin = exact({
				reactCompatibility: false,
				internationalization: {
					owner: 'example',
					sourceLocale: 'en-US',
					catalogFiles: [catalogFile]
				}
			});
			plugin.configResolved?.({ command: 'serve' });
			await plugin.buildStart?.call({ addWatchFile: (file) => watched.push(file) });
			const transformed = await plugin.transform(source, filename);
			const request = transformed?.code.match(
				/from "(virtual:exact-intl\/descriptor\/[^"]+)"/
			)?.[1];
			const resolution = await plugin.resolveId!(request!);
			const resolved = typeof resolution === 'string' ? resolution : resolution!.id;
			expect(watched).toContain(path.resolve(catalogFile));
			expect(plugin.load!(resolved)).toMatchObject({
				code: expect.stringContaining('Bonjour')
			});

			writeCatalog('Salut');
			const moduleNode = { id: resolved };
			const invalidated: unknown[] = [];
			const affected = await plugin.handleHotUpdate?.call(
				{},
				{
					file: catalogFile,
					server: {
						moduleGraph: {
							getModuleById: (id) => (id === resolved ? moduleNode : undefined),
							invalidateModule: (module) => invalidated.push(module)
						}
					}
				}
			);
			expect(affected).toEqual([moduleNode]);
			expect(invalidated).toEqual([moduleNode]);
			expect(plugin.load!(resolved)).toMatchObject({
				code: expect.stringContaining('Salut')
			});

			writeFileSync(
				catalogFile,
				JSON.stringify({
					protocol: 1,
					locale: 'fr',
					owner: 'example',
					messages: { m1_0000000000000000000000000000000000000000000: [] }
				})
			);
			await expect(plugin.handleHotUpdate?.call({}, { file: catalogFile })).rejects.toThrow(
				'unknown message'
			);
			expect(plugin.load!(resolved)).toMatchObject({
				code: expect.stringContaining('Salut')
			});
		} finally {
			rmSync(temporary, { recursive: true, force: true });
		}
	});

	it('does not run intl analysis over React-owned JSX', () => {
		const extracted: unknown[] = [];
		const plugin = exact({
			reactCompatibility: true,
			internationalization: {
				owner: 'example',
				sourceLocale: 'en-US',
				onDescriptors: (descriptors) => extracted.push(...descriptors)
			}
		});
		const result = plugin.transform(
			'/** @jsxImportSource react */\nexport const Greeting = ({ name }) => <p intl:message>Hello {name}</p>;',
			`${process.cwd()}/src/ReactGreeting.tsx`
		);

		expect(extracted).toEqual([]);
		expect(result?.code).not.toContain('@exactjs/intl');
	});

	it('passes compiler targets through to transformed files', () => {
		const plugin = exact({ target: 'client', reactCompatibility: false });
		const result = plugin.transform(
			`
			import { TaskContext } from "@exactjs/core";
      import { readFile } from "node:fs/promises";
      function Page(this: Component<{ title?: string }>) {
				const loadTitle = async (_task: TaskContext = TaskContext.server()) => {
          this.state.title = await readFile("title.txt", "utf8");
				};
				loadTitle();
        return () => <p>{this.state.title}</p>;
      }
    `,
			'/src/page.tsx'
		);

		expect(result?.code).not.toContain('node:fs/promises');
		expect(result?.code).not.toContain('readFile');
	});

	it('uses the paired server target for hydrated Vite SSR requests', () => {
		const plugin = exact({ renderMode: 'hydrate', reactCompatibility: true });
		const result = plugin.transform(
			`
			import { Page } from '../.exact/Page.exact.server.js';
			export const render = () => <Page url="/" />;
		`,
			'/src/server-entry.tsx',
			{ ssr: true }
		);

		expect(result?.code).toContain('createPreparedServerComponentReference');
		expect(result?.code).not.toContain('adaptReactComponent');
	});

	it('compiles an authored test fixture for both target-local runtimes', () => {
		const plugin = exact({
			target: 'client',
			compileTestModules: true,
			include: /\.fixtures\.tsx$/,
			reactCompatibility: false
		});
		const source = `
			export function Page(this: Component<{ label: string }>) {
				return () => <p>{this.state.label}</p>;
			}
		`;
		const client = plugin.transform(source, '/src/page.fixtures.tsx?exact-target=client');
		const server = plugin.transform(source, '/src/page.fixtures.tsx?exact-target=server');

		expect(client?.code).toContain('target: "client"');
		expect(server?.code).toContain('target: "server"');
	});

	it('retains a test target while Vite remaps a JavaScript specifier to TSX', async () => {
		const plugin = exact({ compileTestModules: true, reactCompatibility: false });
		const resolution = await plugin.resolveId?.call(
			{
				resolve: async () => ({ id: '/src/page.fixtures.tsx' })
			},
			'./page.fixtures.js?exact-target=server',
			'/src/page.test.ts'
		);

		expect(resolution).toMatchObject({
			id: '/src/page.fixtures.tsx?exact-target=server'
		});
	});

	it('passes server component mode through to client transforms', () => {
		const plugin = exact({ target: 'client', serverComponents: true, reactCompatibility: false });
		const result = plugin.transform(
			`
			import { TaskContext } from "@exactjs/core";
      import { readFile } from "node:fs/promises";
      export function Page(this: Component<{ count: number }>) {
				const loadPage = async (_task: TaskContext = TaskContext.server()) => {
          await readFile("page.txt", "utf8");
				};
				loadPage();
        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
      }
    `,
			'/src/Page.tsx'
		);

		expect(result?.code).toContain('role: "client"');
		expect(result?.code).toContain('__exactDispatchContinuation');
		expect(result?.code).not.toContain('node:fs/promises');
		expect(result?.code).not.toContain('export function Page(');
	});

	it('resolves exact facade imports to target artifacts', async () => {
		expect(
			exact({ target: 'client', reactCompatibility: false }).resolveId?.(
				'./Panel.exact',
				'/app/src/main.ts'
			)
		).resolves.toMatch(/Panel\.exact\.client\.ts$/);
		expect(
			exact({ target: 'server', reactCompatibility: false }).resolveId?.(
				'./Panel.exact',
				'/app/src/main.ts'
			)
		).resolves.toMatch(/Panel\.exact\.server\.ts$/);
		expect(
			exact({ renderMode: 'hydrate', reactCompatibility: false }).resolveId?.(
				'./Panel.exact',
				'/app/src/main.ts',
				{ ssr: true }
			)
		).resolves.toMatch(/Panel\.exact\.server\.ts$/);
		expect(
			exact({ reactCompatibility: false }).resolveId?.('./Panel', '/app/src/main.ts')
		).resolves.toBeNull();
	});

	it('adds target export conditions for packaged exact artifacts', () => {
		expect(exact({ target: 'client', reactCompatibility: false }).config?.()).toMatchObject({
			resolve: {
				conditions: ['exact-client', 'module', 'browser', 'development|production']
			}
		});
		expect(exact({ target: 'server', reactCompatibility: false }).config?.()).toMatchObject({
			resolve: { conditions: ['exact-server', 'module', 'node', 'development|production'] }
		});
	});

	it('emits one server-only catalog asset with explicit production debug output', async () => {
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
		await plugin.buildStart?.call({ addWatchFile() {} });
		plugin.transform(
			`export function Page(this: Component<{}>) { return () => <main />; }`,
			`${process.cwd()}/src/Page.tsx`
		);
		await plugin.buildEnd?.call(
			{ emitFile: (asset) => (emitted.push(asset), 'inspection') },
			undefined
		);

		const catalog = emitted.find(
			(asset) => asset.fileName === '.exact-inspection/immutable-build.json'
		);
		expect(catalog).toBeDefined();
		expect(JSON.parse(catalog!.source)).toMatchObject({
			protocol: 1,
			buildKey: 'immutable-build',
			roots: { page: { executionRoot: 'page' } }
		});
	});

	it('requires one immutable build identity for explicit production debug output', async () => {
		const plugin = exact({
			target: 'server',
			reactCompatibility: false,
			debug: { catalog: true, runtime: true }
		});
		plugin.configResolved?.({ command: 'build', build: { ssr: true } });

		await expect(plugin.buildStart?.call({ addWatchFile() {} } as never)).rejects.toThrow(
			/explicit immutable debug\.buildKey/
		);
	});

	it('derives independent auto runtime and hardened controls', () => {
		const development = exact({ target: 'client', reactCompatibility: false });
		development.configResolved?.({ command: 'serve' });
		const instrumented = development.transform(
			`export function Page(this: Component<{}>) { return () => <main />; }`,
			'/src/Page.tsx'
		);
		expect(instrumented?.code).toMatch(/^import 'virtual:exact\/devtools-runtime';/);

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
		expect(output?.code).not.toContain('virtual:exact/devtools-runtime');
	});

	it('injects the page-world runtime before application modules only when instrumented', async () => {
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
		expect(await development.resolveId?.('virtual:exact/devtools-runtime')).toBe(
			'\0virtual:exact/devtools-runtime'
		);
		expect(development.load?.('\0virtual:exact/devtools-runtime')).toMatchObject({
			code: expect.stringContaining('"buildKey":"build-client"')
		});

		const hardened = exact({ target: 'client', debug: { runtime: false } });
		hardened.configResolved?.({ command: 'serve' });
		expect(hardened.transformIndexHtml!.handler('<body></body>')).not.toContain(
			'exact/devtools-runtime'
		);
	});
});
