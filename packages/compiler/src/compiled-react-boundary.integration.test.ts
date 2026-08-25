/**
 * @vitest-environment jsdom
 */
import '@exactjs/ssr/runtime/generic-components';
import * as exactCore from '@exactjs/core';
import { createVNode } from '@exactjs/core';
import * as exactRenderRuntime from '@exactjs/core/runtime/render';
import * as exactDurableConstructionRuntime from '@exactjs/core/runtime/component-construction/durable';
import * as exactRenderConstructionRuntime from '@exactjs/core/runtime/component-construction/render';
import * as exactReactivityRuntime from '@exactjs/core/runtime/reactivity';
import * as exactServerRenderStructure from '@exactjs/core/framework/server-render-structure';
import * as exactTaskRuntime from '@exactjs/core/runtime/tasks';
import * as exactDomRenderProgram from '@exactjs/dom/runtime/render-program';
import { render, unmount } from '@exactjs/dom';
import { createExactClient } from '@exactjs/hydrate';
import { flushSync } from '@exactjs/reactive';
import { adaptReactComponent } from '@exactjs/react-compat/exact';
import * as reactRuntime from '@exactjs/react-compat/react19';
import { renderToString } from '@exactjs/ssr';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { transform } from './index.js';

describe('compiled direct React boundary', () => {
	it('compiles, mounts, updates, hydrates, and unmounts one mixed component', () => {
		const client = compileMixedApp('client');
		const serverApp = compileMixedApp('server');
		const mounted = document.createElement('div');
		render(createVNode(client.App, null), mounted);

		click(mounted, '#react-control');
		flushSync();
		expect(mounted.querySelector('#react-control')?.textContent).toBe('1 / local 1');
		expect(mounted.querySelector('#native-derived')?.textContent).toBe('double 2');

		click(mounted, '#native-control');
		flushSync();
		expect(mounted.querySelector('#react-control')?.textContent).toBe('2 / local 1');
		expect(mounted.querySelector('#native-derived')?.textContent).toBe('double 4');
		unmount(mounted);
		expect(mounted.childNodes).toHaveLength(0);

		const server = renderToString(createVNode(serverApp.App, null));
		expect(server.html).not.toContain('Application error');
		const hydrated = document.createElement('div');
		hydrated.innerHTML = server.html;
		expect(hydrated.querySelector('#react-control')).toBeNull();
		const root = createExactClient(hydrated, { islands: client.islands });
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
				/>
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
	const Widget = (props: { value: number; onIncrement(): void }) => {
		const [local, setLocal] = reactRuntime.useState(0);
		return reactRuntime.createElement(
			'button',
			{
				id: 'react-control',
				onClick: () => {
					setLocal((value) => value + 1);
					props.onIncrement();
				}
			},
			`${props.value} / local ${local}`
		);
	};
	const modules: Record<string, unknown> = {
		'@exactjs/core': exactCore,
		'@exactjs/core/runtime/component-construction/durable': exactDurableConstructionRuntime,
		'@exactjs/core/runtime/component-construction/render': exactRenderConstructionRuntime,
		'@exactjs/core/framework/render-structure': exactRenderRuntime,
		'@exactjs/core/framework/server-render-structure': exactServerRenderStructure,
		'@exactjs/core/framework/server-task-helpers': exactCore,
		'@exactjs/core/runtime/render': exactRenderRuntime,
		'@exactjs/core/runtime/reactivity': exactReactivityRuntime,
		'@exactjs/core/runtime/tasks': exactTaskRuntime,
		'@exactjs/dom/runtime/render-program': exactDomRenderProgram,
		'@exactjs/ssr/runtime/generic-components': {},
		'@exactjs/ssr/runtime/structural-boundaries': {},
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
