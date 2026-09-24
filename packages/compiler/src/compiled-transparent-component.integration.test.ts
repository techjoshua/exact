/**
 * @vitest-environment jsdom
 */
import * as exactCore from '@exactjs/core';
import * as exactRenderRuntime from '@exactjs/core/runtime/render';
import * as exactRenderOperationsRuntime from '@exactjs/core/runtime/render-operations';
import * as exactRenderConstructionRuntime from '@exactjs/core/runtime/component-construction/render';
import * as exactDurableConstructionRuntime from '@exactjs/core/runtime/component-construction/durable';
import * as exactComponentAbiRuntime from '@exactjs/core/runtime/component-abi';
import * as exactComponentOperationsRuntime from '@exactjs/core/runtime/component-operations';
import * as exactListsRuntime from '@exactjs/core/runtime/lists';
import * as exactCollectionsRuntime from '@exactjs/core/runtime/collections';
import * as exactContextsRuntime from '@exactjs/core/runtime/contexts';
import * as exactRefsRuntime from '@exactjs/core/runtime/refs';
import * as exactReactivityRuntime from '@exactjs/core/runtime/reactivity';
import * as exactTasksRuntime from '@exactjs/core/runtime/tasks';
import { render, unmount } from '@exactjs/dom';
import { createTestOperation } from '@exactjs/testing/internal/fixtures';
import * as exactDomRenderProgramRuntime from '@exactjs/dom/runtime/render-program';
import { flushSync } from '@exactjs/reactive';
import ts from 'typescript';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { transform } from './index.js';

describe('compiled transparent component', () => {
	it('retains keyed rows when a shared projection has no source provenance', () => {
		const compiled = transform(
			`
/** @exact pure */
function project(items: {id: string; label: string}[]) { return items.map(item => ({...item})); }
function Row(props: {id: string; label: string}) { return () => <span>{props.label}</span>; }
export function Report(props: {items: {id: string; label: string}[]}) {
 const rows = project(props.items);
 return () => <section><p>{rows.length}</p>{rows.map(row => <Row key={row.id} {...row} />)}</section>;
}`,
			{ filename: 'DerivedKeyedRows.tsx', target: 'client' }
		);
		const Report = executeCompiledComponent(compiled, 'Report');
		const container = document.createElement('div');
		onTestFinished(() => unmount(container));
		const update = (items: { id: string; label: string }[]) => {
			render(createTestOperation(Report, { items }), container);
			flushSync();
		};
		update([
			{ id: 'a', label: 'first' },
			{ id: 'b', label: 'second' }
		]);
		const retained = container.querySelectorAll('span')[1];
		update([{ id: 'b', label: 'changed' }]);
		expect(container.querySelector('p')?.textContent).toBe('1');
		expect(container.querySelectorAll('span')).toHaveLength(1);
		expect(container.querySelector('span')).toBe(retained);
		expect(retained?.textContent).toBe('changed');
	});

	it.each(['client', 'hydrate', 'complete'] as const)(
		'updates scalar helper arguments in the %s projection without remounting',
		(componentContractProjection) => {
			const compiled = transform(
				`
			import { type Component } from '@exactjs/core';
			function view(value: string, flag: boolean, state: { clicks: number }, click: () => void, observe: () => void) {
				observe();
				return <button onClick={click}>{value}:{String(flag)}:{state.clicks}</button>;
			}
			function Child(this: Component<{ clicks: number }>, props: { value: string; flag: boolean; observe: () => void; unrelated?: number }) {
				this.state.clicks = 0;
				return () => view(props.value, props.flag, this.state, () => this.state.clicks++, props.observe);
			}
			export function Page(props: { value: string; flag: boolean; observe: () => void; unrelated?: number }) {
				return () => <main><Child value={props.value} flag={props.flag} observe={props.observe} /><span>{props.unrelated}</span></main>;
			}
		`,
				{ filename: 'ScalarHelper.tsx', target: 'client', componentContractProjection }
			);
			const Page = executeCompiledComponent(compiled, 'Page');
			const container = document.createElement('div');
			onTestFinished(() => {
				unmount(container);
			});
			const observe = vi.fn();
			const update = (value: string, flag: boolean, unrelated = 0) => {
				render(createTestOperation(Page, { value, flag, observe, unrelated }), container);
				flushSync();
			};
			update('A', false);
			const button = container.querySelector('button')!;
			expect(button.textContent).toBe('A:false:0');
			button.click();
			flushSync();
			update('A', true);
			expect(button.textContent).toBe('A:true:1');
			update('B', true);
			expect(button.textContent).toBe('B:true:1');
			update('B', false);
			expect(button.textContent).toBe('B:false:1');
			expect(observe).toHaveBeenCalledTimes(4);
			update('B', false, 1);
			expect(observe).toHaveBeenCalledTimes(4);
			expect(container.querySelector('button')).toBe(button);
		}
	);

	it('refreshes shared derived selections in a retained render helper', () => {
		const compiled = transform(
			`
			import { type Component } from '@exactjs/core';
			export function view(state: { items: { id: string; status: string }[]; selectedId: string }) {
				const selected = state.items.find(item => item.id === state.selectedId);
				const status = selected?.status ?? 'missing';
				return <main>{selected ? <section><strong>{status}</strong><span>{selected.status}</span></section> : <p>None</p>}</main>;
			}
			export function Page(this: Component<{ items: { id: string; status: string }[]; selectedId: string }>) {
				this.state.items = [{ id: 'a', status: 'open' }];
				this.state.selectedId = 'a';
				const close = () => { this.state.items = [{ id: 'a', status: 'closed' }]; };
				return () => <div><button onClick={close}>Close</button>{view(this.state)}</div>;
			}
		`,
			{ filename: 'DerivedSelection.tsx', target: 'client' }
		);
		const Page = executeCompiledComponent(compiled, 'Page');
		const container = document.createElement('div');
		try {
			render(createTestOperation(Page, {}), container);
			expect(container.querySelector('main')?.textContent).toBe('openopen');
			container.querySelector('button')!.click();
			flushSync();
			expect(container.querySelector('main')?.textContent).toBe('closedclosed');
		} finally {
			unmount(container);
		}
	});

	it('updates only its compiler-owned focused output range', () => {
		const source = `
			export function Transparent(props: { value: string }) {
				return () => props.value;
			}
		`;
		const compiled = transform(source, {
			filename: 'Transparent.tsx',
			target: 'client'
		});
		expect(compiled).toContain('abi: 1');
		expect(compiled).toContain('createCompiledChildRangeReceipt');
		expect(compiled).toContain('attachExactCompiledClientComponent');
		expect(compiled).not.toContain('createCompiledComponentOutput');

		const Transparent = executeCompiledComponent(compiled, 'Transparent');
		const container = document.createElement('div');
		render(createTestOperation(Transparent, { value: 'before' }), container);
		expect(container.textContent).toBe('before');
		const text = [...container.childNodes].find((node) => node instanceof Text);
		expect(text).toBeInstanceOf(Text);

		render(createTestOperation(Transparent, { value: 'after' }), container);
		flushSync();
		expect(container.textContent).toBe('after');
		expect([...container.childNodes].find((node) => node instanceof Text)).toBe(text);
		unmount(container);
	});

	it('publishes parent prop changes through the retained child artifact receipt', () => {
		const source = `
			function Child(props: { label: string }) {
				return () => <strong>{props.label}</strong>;
			}
			export function Page(props: { label: string }) {
				return () => <main><Child label={props.label} /></main>;
			}
		`;
		const compiled = transform(source, {
			filename: 'DirectChild.tsx',
			target: 'client'
		});
		expect(compiled).toContain('[[2, 0, [[0]], 1]]');
		expect(compiled).not.toContain('bindCompiledProgramComponent');
		expect(compiled).not.toContain('applyCompiledProgramChild');

		const Page = executeCompiledComponent(compiled, 'Page');
		const container = document.createElement('div');
		render(createTestOperation(Page, { label: 'before' }), container);
		const childRoot = container.querySelector('strong');
		expect(childRoot?.textContent).toBe('before');

		render(createTestOperation(Page, { label: 'after' }), container);
		flushSync();
		expect(container.querySelector('strong')).toBe(childRoot);
		expect(childRoot?.textContent).toBe('after');
		unmount(container);
	});

	it('does not duplicate a keyed component range projected by a received conditional prop', () => {
		const source = `
			import { type Component } from '@exactjs/core';
			function Range(props: { children?: unknown; onExited?: () => void }) {
				return () => props.children;
			}
			function projectRange(child: unknown, onExited: () => void) {
				return [<Range key="content" onExited={onExited}>{child}</Range>];
			}
			function Gate(this: Component<{ revision: number }>, props: { shown: boolean; children?: unknown }) {
				this.state.revision = 0;
				const invalidate = () => this.state.revision++;
				const render = () => {
					void this.state.revision;
					return props.shown ? projectRange(props.children, invalidate) : [];
				};
				return () => render();
			}
			export function Page(props: { shown: boolean }) {
				return () => <main><Gate shown={props.shown}><span className="content">ready</span></Gate></main>;
			}
		`;
		const compiled = transform(source, {
			filename: 'ConditionalComponentRange.tsx',
			target: 'client'
		});
		expect(compiled).not.toContain('bindCompiledProgramComponent');
		expect(compiled).toContain('createCompiledChildRangeReceipt');

		const Page = executeCompiledComponent(compiled, 'Page');
		const container = document.createElement('div');
		render(createTestOperation(Page, { shown: false }), container);
		expect(container.querySelectorAll('.content')).toHaveLength(0);

		render(createTestOperation(Page, { shown: true }), container);
		flushSync();
		expect(container.querySelectorAll('.content')).toHaveLength(1);

		render(createTestOperation(Page, { shown: true }), container);
		flushSync();
		expect(container.querySelectorAll('.content')).toHaveLength(1);
		unmount(container);
	});
});

function executeCompiledComponent(
	compiled: string,
	exportName: string
): exactCore.AnyComponentFunction {
	const javascript = ts.transpileModule(compiled, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	}).outputText;
	const module = { exports: {} as Record<string, exactCore.AnyComponentFunction> };
	const modules: Record<string, unknown> = {
		'@exactjs/core': exactCore,
		'@exactjs/core/runtime/collections': exactCollectionsRuntime,
		'@exactjs/core/runtime/lists': exactListsRuntime,
		'@exactjs/core/runtime/component-construction/render': exactRenderConstructionRuntime,
		'@exactjs/core/runtime/component-construction/durable': exactDurableConstructionRuntime,
		'@exactjs/core/runtime/component-abi': exactComponentAbiRuntime,
		'@exactjs/core/runtime/component-operations': exactComponentOperationsRuntime,
		'@exactjs/core/runtime/contexts': exactContextsRuntime,
		'@exactjs/core/runtime/refs': exactRefsRuntime,
		'@exactjs/core/runtime/render': exactRenderRuntime,
		'@exactjs/core/runtime/render-operations': exactRenderOperationsRuntime,
		'@exactjs/core/runtime/reactivity': exactReactivityRuntime,
		'@exactjs/core/runtime/tasks': exactTasksRuntime,
		'@exactjs/dom/runtime/render-program': exactDomRenderProgramRuntime
	};
	new Function('require', 'exports', 'module', javascript)(
		(specifier: string) => {
			if (specifier in modules) return modules[specifier];
			throw new Error(`Unexpected compiled test dependency ${specifier}`);
		},
		module.exports,
		module
	);
	const component = module.exports[exportName];
	if (!component) throw new Error(`Compiled fixture did not export ${exportName}`);
	return component;
}
