import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
	exact,
	mergeConditions,
	resolveExactBunRequest,
	transformExactBunSource,
	type BunBuildLike,
	type BunLoadArgs,
	type BunLoadResult
} from './index.js';

type BunResolveHandler = Parameters<NonNullable<BunBuildLike['onResolve']>>[1];

describe('@exactjs/bun-plugin', () => {
	it('reports opt-in transform timings', () => {
		const onProfile = vi.fn();

		transformExactBunSource('const view = <span />;', '/src/profiled.tsx', { onProfile });

		expect(onProfile).toHaveBeenCalledWith(
			expect.objectContaining({
				subsystem: 'bun-plugin',
				phase: 'transform'
			})
		);
	});

	it('transforms matching TSX sources through the shared compiler', () => {
		const result = transformExactBunSource('const view = <span />;', '/src/view.tsx');

		expect(result?.code).toContain('__exactVNode("span"');
		expect(result?.map).toMatchObject({
			version: 3,
			sources: ['/src/view.tsx'],
			sourcesContent: ['const view = <span />;']
		});
	});

	it('links attributed capabilities into the shared application-bundle catalog', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-bun-enhancement-'));
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

			const result = transformExactBunSource(source, entry, {
				applicationRoot: root,
				reactCompatibility: false
			});

			expect(result?.code).toContain(`__exactRegisterEnhancement("./motion.js#default"`);
			expect(result?.code).toContain('@exactjs/core/framework/enhancement-catalog');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('derives compact runtime instrumentation independently from hardened output', () => {
		const source = `import { TaskContext } from '@exactjs/core';
		function Page() {
			function load(_task: TaskContext = TaskContext.client()) { return Promise.resolve(); }
			load();
			return () => <main />;
		}`;
		const instrumented = transformExactBunSource(source, '/src/Page.tsx', {
			target: 'client',
			debug: { runtime: true, buildKey: 'build', executionRoot: 'page' }
		});
		const hardened = transformExactBunSource(source, '/src/Page.tsx', {
			target: 'client',
			debug: { runtime: false, catalog: false }
		});

		expect(instrumented?.code).toContain('markExactInspectionSource');
		expect(instrumented?.code).toContain('@exactjs/devtools-runtime');
		expect(hardened?.code).not.toContain('@exactjs/devtools');
	});

	it('writes one server-only catalog asset at the end of a Bun build', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-bun-devtools-'));
		let load!: (
			args: BunLoadArgs
		) => BunLoadResult | undefined | Promise<BunLoadResult | undefined>;
		let start!: () => void | Promise<void>;
		let end!: () => void | Promise<void>;
		try {
			writeFileSync(
				path.join(root, 'package.json'),
				JSON.stringify({ name: 'bun-devtools-fixture', private: true, type: 'module' })
			);
			exact({
				target: 'server',
				applicationRoot: root,
				debug: {
					catalog: true,
					runtime: true,
					buildKey: 'bun-build',
					executionRoot: 'page'
				}
			}).setup({
				config: { outdir: 'dist' },
				onResolve() {},
				onLoad(_options, handler) {
					load = handler;
				},
				onStart(handler) {
					start = handler;
				},
				onEnd(handler) {
					end = handler;
				}
			});
			await start();
			await load({
				path: path.join(root, 'src', 'Page.tsx'),
				text: async () => `export function Page() { return () => <main />; }`
			});
			await end();

			const catalog = JSON.parse(
				readFileSync(path.join(root, 'dist', '.exact-inspection', 'bun-build.json'), 'utf8')
			);
			expect(catalog).toMatchObject({
				buildKey: 'bun-build',
				roots: { page: { executionRoot: 'page' } }
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('requires one immutable build identity for explicit production debug output', async () => {
		let start!: () => void | Promise<void>;
		exact({ debug: { catalog: true, runtime: true } }).setup({
			config: {},
			onResolve() {},
			onLoad() {},
			onStart(handler) {
				start = handler;
			}
		});

		await expect(start()).rejects.toThrow(/explicit immutable debug\.buildKey/);
	});

	it('rejects unsupported Bun server hot reload at startup', () => {
		expect(() =>
			exact({ target: 'server' }).setup({
				config: { hot: true },
				onResolve() {},
				onLoad() {}
			})
		).toThrow(/server-hmr-unsupported/);
	});

	it('directs configured remote producers to exactBuild before compilation', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-bun-remote-coordinator-'));
		let start!: () => void | Promise<void>;
		try {
			const scope = path.join(root, 'node_modules', '@exactjs');
			mkdirSync(scope, { recursive: true });
			symlinkSync(
				path.resolve(import.meta.dirname, '../../../plugins/microfrontends'),
				path.join(scope, 'microfrontends'),
				'junction'
			);
			writeFileSync(
				path.join(root, 'package.json'),
				JSON.stringify({
					name: '@fixture/direct-bun-remote',
					private: true,
					type: 'module',
					dependencies: { '@exactjs/microfrontends': '^0.1.0' }
				})
			);
			writeFileSync(
				path.join(root, 'exact.config.mjs'),
				`export default { plugins: { microfrontends(config) { config.exposes['./Area'] = { component: './src/Area.tsx' }; } } };\n`
			);
			exact({ applicationRoot: root }).setup({
				config: {},
				onResolve() {},
				onLoad() {},
				onStart(handler) {
					start = handler;
				}
			});
			await expect(start()).rejects.toThrow('must use exactBuild()');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('does not commit authorization artifacts for a failed watch build', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-bun-failed-generation-'));
		let start!: () => void | Promise<void>;
		let end!: (result?: { success?: boolean }) => void | Promise<void>;
		try {
			writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
			exact({ target: 'server', applicationRoot: root }).setup({
				config: { watch: true, outdir: 'dist' },
				onResolve() {},
				onLoad() {},
				onStart(handler) {
					start = handler;
				},
				onEnd(handler) {
					end = handler;
				}
			});
			await start();
			await end({ success: false });

			expect(
				existsSync(path.join(root, 'dist', '.exact', 'component-library-authorization.json'))
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('resolves exact facade imports through shared artifact resolution', () => {
		expect(resolveExactBunRequest('./Panel.exact', '/app/src/main.ts', { target: 'server' })).toBe(
			path.resolve('/app/src/Panel.exact.server.ts')
		);
		expect(resolveExactBunRequest('./Panel', '/app/src/main.ts')).toBeNull();
	});

	it('merges conditions without duplicating existing entries', () => {
		expect(mergeConditions(['browser', 'exact-client'], ['exact-client'])).toEqual([
			'exact-client',
			'browser'
		]);
	});

	it('adds filename context to transform errors', () => {
		expect(() => transformExactBunSource('const view = <span>;', '/src/broken.tsx')).toThrow(
			/eXact JSX transform failed for \/src\/broken\.tsx/
		);
	});

	it('leaves test modules to Bun unless explicitly enabled', () => {
		expect(
			transformExactBunSource('it("renders", () => <span />);', '/src/view.test.tsx')
		).toBeNull();
		expect(
			transformExactBunSource('export const view = <span />;', '/src/view.test.tsx', {
				compileTestModules: true
			})
		).not.toBeNull();
	});

	it('registers and executes Bun resolve and load hooks', async () => {
		const resolveHooks: Array<{
			filter: RegExp;
			handler: BunResolveHandler;
		}> = [];
		let loadHook!: (
			args: BunLoadArgs
		) => BunLoadResult | undefined | Promise<BunLoadResult | undefined>;
		let startHook!: () => void | Promise<void>;
		const build: BunBuildLike = {
			config: { conditions: ['browser'] },
			onResolve(options, handler) {
				resolveHooks.push({ filter: options.filter, handler });
			},
			onLoad(_options, handler) {
				loadHook = handler;
			},
			onStart(handler) {
				startHook = handler;
			}
		};

		exact({ target: 'server' }).setup(build);

		expect(build.config?.conditions).toEqual(['exact-server', 'browser']);
		await expect(Promise.resolve(startHook())).resolves.toBeUndefined();
		const enhancementResolver = resolveHooks.find((entry) => entry.filter.test('@exactjs/dom'))!;
		await expect(
			Promise.resolve(enhancementResolver.handler({ path: '@exactjs/dom' }))
		).resolves.toEqual({ path: '@exactjs/dom/enhanced' });
		const exactResolver = resolveHooks.find((entry) => entry.filter.test('./Panel.exact'))!;
		await expect(
			Promise.resolve(
				exactResolver.handler({
					path: './Panel.exact',
					importer: '/app/src/main.ts'
				})
			)
		).resolves.toEqual({
			path: path.resolve('/app/src/Panel.exact.server.ts')
		});
		await expect(
			loadHook({
				path: '/app/src/view.tsx',
				text: async () => 'const view = <span />;'
			})
		).resolves.toMatchObject({
			contents: expect.stringContaining('__exactVNode("span"'),
			loader: 'tsx'
		});
		expect(
			(
				await loadHook({
					path: '/app/src/view.tsx',
					text: async () => 'const view = <span />;'
				})
			)?.contents
		).toContain('sourceMappingURL=data:application/json');
		await expect(
			loadHook({
				path: '/app/src/model.ts',
				text: async () => 'export type Model = { title: string };'
			})
		).resolves.toBeUndefined();
	});

	it('surfaces and deduplicates diagnostics by default in watch mode', async () => {
		const root = path.resolve(import.meta.dirname, '../../..');
		const applicationRoot = path.join(root, 'apps/sudoku');
		const model = path.join(applicationRoot, 'src/__bun_diagnostic_model.ts');
		const consumer = path.join(applicationRoot, 'src/__bun_diagnostic_consumer.ts');
		let loadHook!: (
			args: BunLoadArgs
		) => BunLoadResult | undefined | Promise<BunLoadResult | undefined>;
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			writeFileSync(
				model,
				'export interface Model { value: number }\nexport const model: Model = { value: 1 };'
			);
			writeFileSync(
				consumer,
				'import { model } from "./__bun_diagnostic_model.js"; export const value: number = model.value;'
			);
			exact({ applicationRoot }).setup({
				config: { watch: true },
				onResolve() {},
				onLoad(_options, handler) {
					loadHook = handler;
				}
			});
			await loadHook({
				path: model,
				text: async () =>
					'export interface Model { value: number }\nexport const model: Model = { value: 1 };'
			});
			const changed =
				'export interface Model { value: string }\nexport const model: Model = { value: "changed" };';
			writeFileSync(model, changed);
			await loadHook({ path: model, text: async () => changed });
			await loadHook({ path: model, text: async () => changed });
			expect(warn.mock.calls.filter((call) => String(call[0]).includes('TS2322'))).toHaveLength(1);
		} finally {
			warn.mockRestore();
			rmSync(model, { force: true });
			rmSync(consumer, { force: true });
		}
	});

	it('registers React aliases and compiles React JSX to the compatibility runtime', async () => {
		const resolvers: Array<{
			filter: RegExp;
			handler: BunResolveHandler;
		}> = [];
		const build: BunBuildLike = {
			onResolve(options, handler) {
				resolvers.push({ filter: options.filter, handler });
			},
			onLoad() {}
		};
		exact({ reactCompatibility: { target: 18 } }).setup(build);
		const reactResolver = resolvers.find((entry) => entry.filter.test('react'))!;
		await expect(Promise.resolve(reactResolver.handler({ path: 'react' }))).resolves.toEqual({
			path: '@exactjs/react-compat/react18'
		});
		expect(
			transformExactBunSource(
				'/** @jsxImportSource react */\nconst view = <span />;',
				'/src/view.tsx',
				{ reactCompatibility: { target: 18 } }
			)?.code
		).toContain('@exactjs/react-compat/jsx-runtime18');
		expect(
			transformExactBunSource(
				'import { useMemo } from "react"; const view = <span>{useMemo(() => 1, [])}</span>;',
				'/src/inferred.tsx',
				{ reactCompatibility: { target: 18 } }
			)?.code
		).toContain('@exactjs/react-compat/jsx-runtime18');
		expect(
			transformExactBunSource(
				'/** @jsxImportSource @exactjs/jsx */\nimport { Suspense } from "react"; function View() { return () => <Suspense fallback="wait" />; }',
				path.resolve(process.cwd(), 'src/direct-react.tsx'),
				{ reactCompatibility: { target: 18 } }
			)?.code
		).toContain('adaptReactComponent as __exactInteropComponent');
	});

	it('rejects a mismatched reconciler relative to the importer', async () => {
		const resolvers: Array<{
			filter: RegExp;
			handler: BunResolveHandler;
		}> = [];
		exact({ reactCompatibility: { target: 19 } }).setup({
			onResolve(options, handler) {
				resolvers.push({ filter: options.filter, handler });
			},
			onLoad() {}
		});
		const reconcilerResolver = resolvers.find((entry) => entry.filter.test('react-reconciler'))!;
		await expect(
			Promise.resolve().then(() =>
				reconcilerResolver.handler({
					path: 'react-reconciler',
					importer: path.resolve(
						import.meta.dirname,
						'../../../apps/react-reconciler-reference-18/src/scenario.mjs'
					)
				})
			)
		).rejects.toThrow(/target 19.*react-reconciler 0\.29\.2/);
	});
});
