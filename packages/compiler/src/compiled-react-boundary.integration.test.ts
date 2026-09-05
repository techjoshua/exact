/**
 * @vitest-environment jsdom
 */
import * as exactCore from '@exactjs/core';
import * as exactRenderRuntime from '@exactjs/core/runtime/render';
import * as exactRenderOperationsRuntime from '@exactjs/core/runtime/render-operations';
import * as exactDurableConstructionRuntime from '@exactjs/core/runtime/component-construction/durable';
import * as exactDirectServerConstructionRuntime from '@exactjs/core/runtime/component-construction/direct-server';
import * as exactRenderConstructionRuntime from '@exactjs/core/runtime/component-construction/render';
import * as exactTaskConstructionRuntime from '@exactjs/core/runtime/component-construction/task';
import * as exactComponentAbiRuntime from '@exactjs/core/runtime/component-abi';
import * as exactComponentOperationsRuntime from '@exactjs/core/runtime/component-operations';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import * as exactCompatibilityContributions from '@exactjs/core/framework/compatibility-contributions';
import * as exactReactivityRuntime from '@exactjs/core/runtime/reactivity';
import * as exactServerRenderStructure from '@exactjs/core/framework/server-render-structure';
import * as exactTaskRuntime from '@exactjs/core/runtime/tasks';
import * as exactDomRenderProgram from '../../dom/src/runtime/render-program.js';
import * as exactSsrStructuralBoundaries from '@exactjs/ssr/runtime/structural-boundaries';
// Install against the same source capability registry used by the package-test
// aliases. Importing a previously built package here would create a second
// module instance and leave source-rendered contributions unhandled.
import { render, unmount } from '@exactjs/dom';
import { createExactClient } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { adaptReactComponent } from '@exactjs/react-compat/exact';
import type { ReactNode } from '@exactjs/react-compat';
import * as reactRuntime from '@exactjs/react-compat/react19';
import '../../react-dom-compat/src/renderer/native-island.js';
import { renderToString } from '@exactjs/ssr';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { transform } from './index.js';

describe('compiled direct React boundary', () => {
	it('keeps host-classified native imports on the native ABI outside component render functions', () => {
		const compiled = transform(
			`
				import { Native } from './native.js';
				import { Foreign } from 'react-widget';
				export function mountScenarios() {
					return <main><Native label="native" /><Foreign label="foreign" /></main>;
				}
			`,
			{
				filename: 'client-scenarios.tsx',
				target: 'client',
				jsxInterop: {
					adapterModule: '@exactjs/react-compat/exact',
					adapterExport: 'adaptReactComponent',
					cacheKey: 'react:19:classification',
					classify: ({ sourceModule }) => (sourceModule === './native.js' ? 'exact' : 'component')
				}
			}
		);

		expect(compiled).toContain('__exactComponentReceipt(Native,');
		expect(compiled).not.toContain('createCompiledVNode');
		expect(compiled).toContain('component: Foreign');
		expect(compiled).not.toContain('component: Native');
	});

	it('compiles, mounts, updates, hydrates, and unmounts one mixed component', () => {
		const client = compileMixedApp('client');
		const serverApp = compileMixedApp('server');
		const mounted = document.createElement('div');
		render(createCompiledComponentReceipt(client.App, null), mounted);

		click(mounted, '#react-control');
		flushSync();
		expect(mounted.querySelector('#react-control')?.textContent).toBe('1 / local 1');
		expect(mounted.querySelector('#native-derived')?.textContent).toBe('double 2');
		expect(mounted.querySelector('#native-through-react')?.textContent).toBe('through 1');

		click(mounted, '#native-control');
		flushSync();
		expect(mounted.querySelector('#react-control')?.textContent).toBe('2 / local 1');
		expect(mounted.querySelector('#native-derived')?.textContent).toBe('double 4');
		expect(mounted.querySelector('#native-through-react')?.textContent).toBe('through 2');
		unmount(mounted);
		expect(mounted.childNodes).toHaveLength(0);

		const server = renderToString(createCompiledComponentReceipt(serverApp.App, null));
		expect(server.html).not.toContain('Application error');
		const hydrated = document.createElement('div');
		hydrated.innerHTML = server.html;
		expect(hydrated.querySelector('#react-control')).toBeNull();
		const root = createExactClient(hydrated, {
			islands: client.islands,
			onErrorReport(report) {
				throw report.error;
			}
		});
		expect(hydrated.querySelector('#react-control')).toBeInstanceOf(HTMLElement);

		click(hydrated, '#react-control');
		flushSync();
		expect(hydrated.querySelector('#react-control')?.textContent).toBe('1 / local 1');
		expect(hydrated.querySelector('#native-derived')?.textContent).toBe('double 2');
		root.dispose();
	});
});

type CompiledMixedApp = Readonly<{
	App: exactCore.AnyComponentFunction;
	islands: Record<string, exactCore.AnyComponentFunction>;
}>;

function compileMixedApp(target: 'client' | 'server'): CompiledMixedApp {
	const source = `
		import { Widget } from 'react-widget';
		declare class Component<S> { state: S }
		export function App(this: Component<{ count: number }>) {
			this.state.count = 0;
			return () => <>
				<Widget
					value={this.state.count}
					onIncrement={() => this.state.count++}
				>
					<em id="native-through-react">through {this.state.count}</em>
				</Widget>
				<button id="native-control" onClick={() => this.state.count++}>native</button>
				<span id="native-derived">double {this.state.count * 2}</span>
			</>;
		}
	`;
	const compiled = transform(source, {
		filename: 'CompiledReactBoundary.tsx',
		target,
		...(target === 'client'
			? { componentContractProjection: 'hydrate' as const, serverComponents: true }
			: { serverComponents: true }),
		jsxInterop: {
			adapterModule: '@exactjs/react-compat/exact',
			adapterExport: 'adaptReactComponent',
			cacheKey: 'react:19:integration',
			classify: ({ sourceModule }) => (sourceModule === 'react-widget' ? 'component' : 'unknown')
		}
	});
	const javascript = ts.transpileModule(compiled, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022
		}
	}).outputText;
	const module = { exports: {} as Record<string, exactCore.AnyComponentFunction> };
	const Widget = (props: { value: number; onIncrement(): void; children?: ReactNode }) => {
		const [local, setLocal] = reactRuntime.useState(0);
		return reactRuntime.createElement(
			'section',
			null,
			reactRuntime.createElement(
				'button',
				{
					id: 'react-control',
					onClick: () => {
						setLocal((value) => value + 1);
						props.onIncrement();
					}
				},
				`${props.value} / local ${local}`
			),
			props.children
		);
	};
	const modules: Record<string, unknown> = {
		'@exactjs/core': exactCore,
		'@exactjs/core/runtime/component-construction/durable': exactDurableConstructionRuntime,
		'@exactjs/core/runtime/component-construction/direct-server':
			exactDirectServerConstructionRuntime,
		'@exactjs/core/runtime/component-construction/render': exactRenderConstructionRuntime,
		'@exactjs/core/runtime/component-construction/task': exactTaskConstructionRuntime,
		'@exactjs/core/runtime/component-abi': exactComponentAbiRuntime,
		'@exactjs/core/runtime/component-operations': exactComponentOperationsRuntime,
		'@exactjs/core/framework/compatibility-contributions': exactCompatibilityContributions,
		'@exactjs/core/framework/render-structure': exactRenderRuntime,
		'@exactjs/core/framework/server-render-structure': exactServerRenderStructure,
		'@exactjs/core/framework/server-task-helpers': exactCore,
		'@exactjs/core/runtime/render': exactRenderRuntime,
		'@exactjs/core/runtime/render-operations': exactRenderOperationsRuntime,
		'@exactjs/core/runtime/reactivity': exactReactivityRuntime,
		'@exactjs/core/runtime/tasks': exactTaskRuntime,
		'@exactjs/dom/runtime/render-program': exactDomRenderProgram,
		'@exactjs/ssr/runtime/structural-boundaries': exactSsrStructuralBoundaries,
		'@exactjs/react-compat/exact': { adaptReactComponent },
		'react-widget': { Widget }
	};
	const requireModule = (specifier: string): unknown => {
		if (specifier in modules) return modules[specifier];
		throw new Error(`Unexpected compiled test dependency ${specifier}`);
	};
	new Function('require', 'exports', 'module', javascript)(requireModule, module.exports, module);
	if (!module.exports.App) throw new Error('Compiled integration fixture did not export App');
	return {
		App: module.exports.App,
		islands: Object.fromEntries(
			Object.entries(module.exports).filter(([name]) => name.startsWith('App_ExactClient_'))
		)
	};
}

function click(container: Element, selector: string): void {
	const element = container.querySelector(selector);
	if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
	element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
