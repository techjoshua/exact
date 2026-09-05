/**
 * @vitest-environment jsdom
 */
import * as exactCore from '@exactjs/core';
import * as exactRenderRuntime from '@exactjs/core/runtime/render';
import * as exactRenderOperationsRuntime from '@exactjs/core/runtime/render-operations';
import * as exactRenderConstructionRuntime from '@exactjs/core/runtime/component-construction/render';
import * as exactComponentAbiRuntime from '@exactjs/core/runtime/component-abi';
import * as exactComponentOperationsRuntime from '@exactjs/core/runtime/component-operations';
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
import { describe, expect, it } from 'vitest';
import { transform } from './index.js';

describe('compiled transparent component', () => {
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
		expect(compiled).toContain('[[2, 0, [[0]], 1]]');
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
		'@exactjs/core/runtime/component-construction/render': exactRenderConstructionRuntime,
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
