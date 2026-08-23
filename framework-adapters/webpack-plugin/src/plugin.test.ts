/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
	ExactWebpackPlugin,
	addWebpackConditions,
	addWebpackEnhancementAliases,
	applyExactWebpackResolver,
	createExactWebpackRule,
	compilerSessionForWebpackLoader,
	resolveExactWebpackRequest,
	transformExactWebpackSource,
	type ExactWebpackPluginOptions,
	type WebpackCompilerLike
} from './index.js';
import { webpackCompilerSessionCount } from './sessions.js';

describe('@exactjs/webpack-plugin', () => {
	it('reports opt-in transform timings', () => {
		const onProfile = vi.fn();

		transformExactWebpackSource('const view = <span />;', '/src/profiled.tsx', { onProfile });

		expect(onProfile).toHaveBeenCalledWith(
			expect.objectContaining({
				subsystem: 'webpack-plugin',
				phase: 'transform'
			})
		);
	});

	it('transforms matching TSX sources through the shared compiler', () => {
		const result = transformExactWebpackSource('const view = <span />;', '/src/view.tsx');

		expect(result?.code).toContain('__exactVNode("span"');
		expect(result?.map).toMatchObject({
			version: 3,
			sources: ['/src/view.tsx'],
			sourcesContent: ['const view = <span />;']
		});
	});

	it('projects runtime contracts for client-only bundles', () => {
		const result = transformExactWebpackSource(
			`export function Counter() { return () => <button onClick={() => 1}>Count</button>; }`,
			'/src/Counter.tsx',
			{ renderMode: 'client' }
		);

		expect(result?.code).not.toContain('resumption:');
		expect(result?.code).not.toContain('render: "returned-function"');
	});

	it('links attributed capabilities into the shared application-bundle catalog', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-webpack-enhancement-'));
		const entry = path.join(root, 'entry.tsx');
		const source = `import motion from './motion.js' with { type: 'exact-enhancement' };
			export const view = <article motion:preset="fade" />;`;
		try {
			writeFileSync(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						module: 'nodenext',
						moduleResolution: 'nodenext',
						target: 'es2022',
						jsx: 'preserve'
					},
					include: ['*.ts', '*.tsx']
				})
			);
			writeFileSync(
				path.join(root, 'motion.ts'),
				`export { default } from './motion-implementation.js' with { type: 'exact-enhancement' };`
			);
			writeFileSync(
				path.join(root, 'motion-implementation.ts'),
				`export default function Motion(props: { preset?: string; children?: unknown }) { return props.children; }`
			);
			writeFileSync(entry, source);

			const result = transformExactWebpackSource(source, entry, {
				applicationRoot: root,
				reactCompatibility: false
			});

			expect(result?.code).toContain(`__exactRegisterEnhancement("./motion.js#default"`);
			expect(result?.code).toContain('@exactjs/core/framework/enhancement-catalog');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('passes target options through to transforms', () => {
		const result = transformExactWebpackSource(
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
			'/src/page.tsx',
			{ target: 'client' }
		);

		expect(result?.code).not.toContain('node:fs/promises');
	});

	it('keeps routing shells isomorphic while projecting client lifecycle work by target', () => {
		const source = `import type { Component } from '@exactjs/core';
		export function RouteShell(this: Component) {
			this.onMount(() => window.addEventListener('popstate', () => undefined));
			return () => <main>route</main>;
		}`;
		const client = transformExactWebpackSource(source, '/src/RouteShell.tsx', {
			target: 'client'
		});
		const server = transformExactWebpackSource(source, '/src/RouteShell.tsx', {
			target: 'server'
		});

		expect(client?.code).toContain('window.addEventListener');
		expect(client?.code).toContain('__exactComponentContract');
		expect(server?.code).toContain('window.addEventListener');
		expect(server?.code).toContain('__exactRegisterLifecycle(this, "mount"');
		expect(server?.code).toContain('__exactComponentContract');
	});

	it('derives compact runtime instrumentation independently from hardened output', () => {
		const source = `import { TaskContext } from '@exactjs/core';
		function Page() {
			function load(_task: TaskContext = TaskContext.client()) { return Promise.resolve(); }
			load();
			return () => <main />;
		}`;
		const instrumented = transformExactWebpackSource(source, '/src/Page.tsx', {
			target: 'client',
			debug: { runtime: true, buildKey: 'build', executionRoot: 'page' }
		});
		const hardened = transformExactWebpackSource(source, '/src/Page.tsx', {
			target: 'client',
			debug: { runtime: false, catalog: false }
		});

		expect(instrumented?.code).toContain('markExactInspectionSource');
		expect(instrumented?.code).toContain('@exactjs/devtools-runtime');
		expect(hardened?.code).not.toContain('@exactjs/devtools');
	});

	it('emits one server-only catalog asset from loader-owned compiler results', () => {
		let compile!: (compilation: any) => void;
		let assets!: () => void;
		let shutdown!: () => void;
		const emitted = new Map<string, string>();
		const compiler: WebpackCompilerLike = {
			options: {},
			hooks: {
				thisCompilation: {
					tap(_name, handler) {
						compile = handler;
					}
				},
				shutdown: {
					tap(_name, handler) {
						shutdown = handler;
					}
				}
			}
		};
		new ExactWebpackPlugin({
			target: 'server',
			applicationRoot: process.cwd(),
			debug: {
				catalog: true,
				runtime: true,
				buildKey: 'webpack-build',
				executionRoot: 'page'
			}
		}).apply(compiler);
		const loaderOptions = (
			compiler.options.module!.rules![0] as {
				use: Array<{ options: ExactWebpackPluginOptions }>;
			}
		).use[0]!.options;
		transformExactWebpackSource(
			`export function Page() { return () => <main />; }`,
			`${process.cwd()}/src/Page.tsx`,
			loaderOptions,
			compilerSessionForWebpackLoader(loaderOptions.__exactSessionId)
		);
		compile({
			hooks: {
				processAssets: {
					tap(_options: unknown, handler: () => void) {
						assets = handler;
					}
				}
			},
			emitAsset(filename: string, source: { source(): string }) {
				emitted.set(filename, source.source());
			}
		});
		assets();

		expect(emitted.has('.exact-inspection/webpack-build.json')).toBe(true);
		expect(JSON.parse(emitted.values().next().value!)).toMatchObject({
			buildKey: 'webpack-build',
			roots: { page: { executionRoot: 'page' } }
		});
		shutdown();
	});

	it('requires one immutable build identity for explicit production debug output', () => {
		expect(() =>
			new ExactWebpackPlugin({ debug: { catalog: true, runtime: true } }).apply({
				options: {}
			})
		).toThrow(/explicit immutable debug\.buildKey/);
	});

	it('resolves exact facade imports through shared artifact resolution', () => {
		expect(
			resolveExactWebpackRequest('./Panel.exact', '/app/src/main.ts', { target: 'server' })
		).toBe(path.resolve('/app/src/Panel.exact.server.ts'));
		expect(resolveExactWebpackRequest('./Panel', '/app/src/main.ts')).toBeNull();
	});

	it('adds export conditions without duplicating existing conditions', () => {
		const compiler: WebpackCompilerLike = {
			options: { resolve: { conditionNames: ['browser', 'exact-client'] } }
		};

		addWebpackConditions(compiler, ['exact-client']);

		expect(compiler.options.resolve?.conditionNames).toEqual(['exact-client', 'browser']);
	});

	it('adds renderer facade aliases without replacing application aliases', () => {
		const compiler: WebpackCompilerLike = {
			options: { resolve: { alias: { '@exactjs/dom$': '/custom/dom.js' } } }
		};

		addWebpackEnhancementAliases(compiler);

		expect(compiler.options.resolve?.alias).toMatchObject({
			'@exactjs/dom$': '/custom/dom.js',
			'@exactjs/hydrate$': '@exactjs/hydrate/enhanced',
			'@exactjs/ssr$': '@exactjs/ssr/enhanced'
		});
	});

	it('creates a pre-loader rule', () => {
		expect(createExactWebpackRule({ target: 'server' })).toMatchObject({
			enforce: 'pre',
			type: 'javascript/auto',
			use: [{ loader: '@exactjs/webpack-plugin/loader', options: { target: 'server' } }]
		});
	});

	it('adds filename context to transform errors', () => {
		expect(() => transformExactWebpackSource('const view = <span>;', '/src/broken.tsx')).toThrow(
			/eXact JSX transform failed for \/src\/broken\.tsx/
		);
	});

	it('applies conditions and loader rules to a compiler', () => {
		let resolverFactory: ((resolver: any) => any) | undefined;
		let watchRun!: (
			compiler: WebpackCompilerLike & {
				modifiedFiles?: Iterable<string>;
				removedFiles?: Iterable<string>;
			}
		) => void;
		const compiler: WebpackCompilerLike = { options: {} };
		compiler.hooks = {
			watchRun: {
				tap(_name, handler) {
					watchRun = handler;
				}
			},
			normalModuleFactory: {
				tap(_name, handler) {
					handler({
						hooks: {
							resolver: {
								tap(_pluginName, factory) {
									resolverFactory = factory;
								}
							}
						}
					});
				}
			}
		};

		new ExactWebpackPlugin({ target: 'server' }).apply(compiler);

		expect(compiler.options.resolve?.conditionNames).toEqual(['exact-server']);
		expect(compiler.options.resolve?.alias).toMatchObject({
			'@exactjs/dom$': '@exactjs/dom/enhanced',
			'@exactjs/hydrate$': '@exactjs/hydrate/enhanced',
			'@exactjs/ssr$': '@exactjs/ssr/enhanced'
		});
		expect(compiler.options.module?.rules).toHaveLength(1);
		expect(resolverFactory).toBeTypeOf('function');
		expect(() =>
			watchRun({
				options: compiler.options,
				modifiedFiles: ['/project/src/model.ts'],
				removedFiles: ['/project/src/removed.ts']
			})
		).not.toThrow();
		expect(() =>
			watchRun({
				options: compiler.options,
				modifiedFiles: ['/project/tsconfig.json']
			})
		).not.toThrow();
	});

	it('ignores broad watch sets that contain files outside the compiler program', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'exact-webpack-watch-'));
		const style = path.join(directory, 'styles.css');
		const analysis = path.join(directory, 'analysis.webmanifest');
		const buildInfo = path.join(directory, 'tsconfig.tsbuildinfo');
		let watchRun!: (
			compiler: WebpackCompilerLike & {
				modifiedFiles?: Iterable<string>;
				removedFiles?: Iterable<string>;
			}
		) => void;
		let shutdown!: () => void;
		const compiler: WebpackCompilerLike = {
			options: {},
			hooks: {
				watchRun: {
					tap(_name, handler) {
						watchRun = handler;
					}
				},
				shutdown: {
					tap(_name, handler) {
						shutdown = handler;
					}
				}
			}
		};
		try {
			writeFileSync(style, '.view { display: grid; }');
			writeFileSync(analysis, '{"name":"fixture"}');
			writeFileSync(buildInfo, '{}');
			new ExactWebpackPlugin().apply(compiler);

			expect(() =>
				watchRun({
					options: compiler.options,
					modifiedFiles: [style, analysis, buildInfo]
				})
			).not.toThrow();
		} finally {
			shutdown?.();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('owns, deduplicates, and releases diagnostics by default in watch mode', () => {
		const root = path.resolve(import.meta.dirname, '../../..');
		const applicationRoot = path.join(root, 'apps/kanban');
		const model = path.join(applicationRoot, 'src/__webpack_diagnostic_model.ts');
		const consumer = path.join(applicationRoot, 'src/__webpack_diagnostic_consumer.ts');
		const warnings: string[] = [];
		let watchRun!: (compiler: WebpackCompilerLike & { modifiedFiles?: Iterable<string> }) => void;
		let shutdown!: () => void;
		const compiler: WebpackCompilerLike = {
			options: {},
			hooks: {
				watchRun: {
					tap(_name, handler) {
						watchRun = handler;
					}
				},
				shutdown: {
					tap(_name, handler) {
						shutdown = handler;
					}
				}
			},
			getInfrastructureLogger: () => ({ warn: (message) => warnings.push(message) })
		};
		const before = webpackCompilerSessionCount();
		try {
			writeFileSync(
				model,
				'export interface Model { value: number }\nexport const model: Model = { value: 1 };'
			);
			writeFileSync(
				consumer,
				'import { model } from "./__webpack_diagnostic_model.js"; export const value: number = model.value;'
			);
			new ExactWebpackPlugin({ applicationRoot }).apply(compiler);
			expect(webpackCompilerSessionCount()).toBe(before + 1);
			watchRun({ options: compiler.options, modifiedFiles: [model] });
			writeFileSync(
				model,
				'export interface Model { value: string }\nexport const model: Model = { value: "changed" };'
			);
			watchRun({ options: compiler.options, modifiedFiles: [model] });
			watchRun({ options: compiler.options, modifiedFiles: [model] });
			expect(warnings.filter((message) => message.includes('TS2322'))).toHaveLength(1);
			shutdown();
			expect(webpackCompilerSessionCount()).toBe(before);
		} finally {
			if (webpackCompilerSessionCount() > before) shutdown?.();
			rmSync(model, { force: true });
			rmSync(consumer, { force: true });
		}
	});

	it('installs React aliases and compiles inferred React JSX to the compatibility runtime', () => {
		const compiler: WebpackCompilerLike = { options: {} };
		new ExactWebpackPlugin({ reactCompatibility: { target: 19 } }).apply(compiler);
		expect(compiler.options.resolve?.alias).toMatchObject({
			react$: '@exactjs/react-compat/react19',
			'react/jsx-runtime$': '@exactjs/react-compat/jsx-runtime19',
			'react-dom/client$': '@exactjs/react-dom-compat/client19'
		});
		expect(
			transformExactWebpackSource(
				'/** @jsxImportSource react */\nconst view = <span />;',
				'/src/view.tsx',
				{ reactCompatibility: { target: 19 } }
			)?.code
		).toContain('@exactjs/react-compat/jsx-runtime19');
		expect(
			transformExactWebpackSource(
				'import * as React from "react"; const view = <span>{React.version}</span>;',
				'/src/inferred.tsx',
				{ reactCompatibility: { target: 19 } }
			)?.code
		).toContain('@exactjs/react-compat/jsx-runtime19');
		expect(
			transformExactWebpackSource(
				'/** @jsxImportSource @exactjs/jsx */\nimport { Suspense } from "react"; function View() { return () => <Suspense fallback="wait" />; }',
				path.resolve(process.cwd(), 'src/direct-react.tsx'),
				{ reactCompatibility: { target: 19 } }
			)?.code
		).toContain('adaptReactComponent as __exactInteropComponent');
	});

	it('rewrites exact facade requests through Webpack resolver hooks', () => {
		let handler!: (
			request: { request?: string; path?: string },
			context: unknown,
			callback: (error?: Error | null, result?: unknown) => void
		) => void;
		const resolver = applyExactWebpackResolver(
			{
				hooks: {
					resolve: {
						tapAsync(_name, next) {
							handler = next;
						}
					}
				}
			},
			{ target: 'server' }
		);

		expect(resolver).toBeDefined();

		let result: unknown;
		handler({ request: './Panel.exact', path: '/app/src' }, {}, (_error, value) => {
			result = value;
		});

		expect(result).toMatchObject({
			request: path.resolve('/app/src/Panel.exact.server.ts')
		});
	});

	it('rejects a mismatched reconciler relative to the importing project', () => {
		let handler!: (
			request: { request?: string; path?: string },
			context: unknown,
			callback: (error?: Error | null) => void
		) => void;
		applyExactWebpackResolver(
			{
				hooks: {
					resolve: {
						tapAsync(_name, next) {
							handler = next;
						}
					}
				}
			},
			{ reactCompatibility: { target: 19 } }
		);
		let error: Error | null | undefined;
		handler(
			{
				request: 'react-reconciler',
				path: path.resolve(import.meta.dirname, '../../../apps/react-reconciler-reference-18')
			},
			{},
			(nextError) => {
				error = nextError;
			}
		);
		expect(error?.message).toMatch(/target 19.*react-reconciler 0\.29\.2/);
	});
});
